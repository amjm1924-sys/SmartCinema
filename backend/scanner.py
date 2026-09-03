# Scanner Module for CinemaStream
# Intelligent media file scanner with smart filename parsing

import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from transcoder import Transcoder
from metadata import MetadataFetcher
from verifier import MultiSourceVerifier
try:
    from database import get_connection, delete_media, execute_with_retry
except ImportError:
    pass # Handle circular import if called from app

try:
    from session_logger import session_logger as _slog
except ImportError:
    _slog = None

VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.ts', '.m4v', '.mov', '.wmv', '.flv', '.webm'}

# Subtitle extensions
SUBTITLE_EXTENSIONS = {'.srt', '.vtt', '.ass', '.ssa', '.sub'}

# Quality patterns
QUALITY_PATTERNS = [
    (r'4k|2160p', '4K'),
    (r'2k|1440p', '2K'),
    (r'1080p|fullhd|fhd', '1080p'),
    (r'720p|hd', '720p'),
    (r'576p|536p|540p', '576p'),
    (r'480p|sd', '480p'),
    (r'360p', '360p'),
    (r'280p|240p', '240p'),
    (r'(\d{3,4})p', '\\1p'), # Generic catch-all pattern for weird resolutions like 536p
]

# Source patterns to remove (ONLY match as whole words with \b boundaries)
# REMOVED 'me', 'co' — these corrupt titles like "Succession" -> "Suession"
SOURCE_PATTERNS = [
    r'bluray', r'bdrip', r'brrip', r'webrip', r'web-dl', r'webdl', r'hdtv',
    r'dvdrip', r'dvdscr', r'cam', r'hdcam', r'hdrip', r'hd-rip',
    r'akwam',
]

# Site names to remove (Use STRICT patterns to avoid corrupting valid words)
SITE_PATTERNS = [
    r'shahid4u\.com?', r'egybest\.?app?', r'mycima\.[a-z]+', r'wecima\.[a-z]+',
    r'\barabseed\b', r'\bakwam\b', r'\bcima4u\b', r'tuktokcinema\.com', r'\bfaselhd\b', r'\bmovizland\b',
    r'\bakoam\b', r'\bfushaar\b', r'\bcimaclub\b', r'\bshahed4u\b', r'\blodynet\b',
    r'فاصل إعلاني', r'مترجم اون لاين', r'مترجم', r'فيلم', r'مسلسل',
    r'\btopcinema\b', r'\btuktokcinema\b', r'\bcm-hacker\b', r'\bwe\s*show\b',
    r'\biconflim\b', r'\btelegram\b', r'\bbljoin\b', r'\bboxoffice\b',
    r'\bpahe\b', r'\bpsa\b', r'\byify\b', r'\brarbg\b', r'\bganool\b',
    r'\bqxr\b', r'\butr\b', r'\bvxt\b',
]

# Arabic number mappings
ARABIC_NUMBERS = {
    'الأولى': 1, 'الأول': 1, 'الاولي': 1, 'الاول': 1,
    'الثانية': 2, 'الثاني': 2, 'التاني': 2,
    'الثالثة': 3, 'الثالث': 3,
    'الرابعة': 4, 'الرابع': 4,
    'الخامسة': 5, 'الخامس': 5,
    'السادسة': 6, 'السادس': 6,
    'السابعة': 7, 'السابع': 7,
    'الثامنة': 8, 'الثامن': 8,
    'التاسعة': 9, 'التاسع': 9,
    'العاشرة': 10, 'العاشر': 10,
}

# Minimum file size to consider (10MB) - helps filter out sample files/extras
# Reduced from 75MB to catch smaller/compressed movies
MIN_FILE_SIZE = 10 * 1024 * 1024 

class MediaScanner:
    """Scans directories for media files and parses their metadata"""
    
    def __init__(self):
        self.known_series = {}  # Cache for series detection
        self.transcoder = Transcoder()
        self.fetcher = MetadataFetcher()
        self.verifier = MultiSourceVerifier()  # Multi-source verification
        self.folder_type_cache = {} # Cache for folder types (movie/series)

    def _log(self, msg: str, level: str = 'INFO'):
        """Safe logging to avoid Windows console encoding errors and record to session_logger"""
        try:
            print(msg)
        except UnicodeEncodeError:
            try:
                print(msg.encode('ascii', 'replace').decode('ascii'))
            except Exception:
                pass
        if _slog:
            try:
                _slog.log_backend(level, f'[Scanner] {msg}')
            except Exception:
                pass
    
    def scan_directory(self, directory: str, cleanup: bool = False) -> List[Dict]:
        """Recursively scan a directory for media files"""
        from scan_status import scan_status
        directory = Path(directory)
        if not directory.exists():
            print(f"Directory not found: {directory}")
            return []
            
        print(f"Scanning directory: {directory}")
        
        # Estimate total files (rough count for progress bar)
        estimated_total = sum([len(files) for r, d, files in os.walk(directory)])
        scan_status.start_scan(total_estimation=estimated_total)

        media_files = []
        
        try:
            # Determine Library Type
            sys_path_type = 'unknown'
            try:
                from classification import classify_media_type
                sys_path_type = classify_media_type(str(directory))
            except Exception as e:
                self._log(f"Classification failed for {directory}: {e}", level='WARN')

            self._log(f"Scanning Library: {directory} (Type: {sys_path_type})")

            if sys_path_type == 'series':
                # SERIES MODE: Smart Hierarchy Detection
                
                # Check if current directory IS a series (contains Seasons or Episodes)
                has_season_folders = False
                has_video_files = False
                for item in directory.iterdir():
                    if item.is_dir() and re.match(r'^(Season|S\d{1,2}|Specials|Bonus)', item.name, re.IGNORECASE):
                        has_season_folders = True
                        break
                    if item.is_file() and item.suffix.lower() in VIDEO_EXTENSIONS:
                        has_video_files = True
                        
                is_single_series = has_season_folders or has_video_files
                
                if is_single_series:
                    series_name = self._clean_filename(directory.name)
                    self._log(f"  Detected Single Series Root: {directory.name} -> '{series_name}'")
                    media_files = self._scan_series_recursive(directory, series_name)
                else:
                    # Iterate immediate children (Series Roots)
                    for item in directory.iterdir():
                        if item.is_dir():
                            series_name = self._clean_filename(item.name)
                            self._log(f"  Found Series Root: {item.name} -> '{series_name}'")
                            scan_status.update_progress(item.name, status='scanning_folder')
                            
                            # Recursive scan inside this Series Root
                            series_files = self._scan_series_recursive(item, series_name)
                            media_files.extend(series_files)
            else:
                # MOVIE / UNKNOWN MODE: Flat Scan
                self._log("  Running Flat Scan...")
                media_files = self._scan_flat_recursive(directory)
        
            # Group episodes
            grouped_media = self._group_episodes(media_files)
            
            # Cleanup missing files if requested
            if cleanup:
                self._cleanup_missing_files(directory)
            
            scan_status.finish_scan()
            return grouped_media

        except Exception as e:
            import traceback
            err_msg = f"Fatal scan error for {directory}: {e}\n{traceback.format_exc()}"
            self._log(err_msg, level='ERROR')
            scan_status.log_failure(str(directory), f"Fatal scan error: {str(e)}")
            scan_status.finish_scan()
            return []

    def _cleanup_missing_files(self, directory: Path):
        """Remove database entries for files that no longer exist in the given directory"""
        try:
            from database import get_connection, delete_media
            self._log(f"Running cleanup for missing files in: {directory}")
            
            with get_connection() as conn:
                cursor = conn.cursor()
                
                # Normalize path for matching (forward slashes for SQLite LIKE)
                norm_dir = os.path.normpath(str(directory)).replace('\\', '/')
                
                # Get all media that should be in this directory tree
                cursor.execute(
                    "SELECT id, title, file_path FROM media WHERE REPLACE(folder_path, '\\', '/') LIKE ?", 
                    (f"{norm_dir}%",)
                )
                
                existing_records = cursor.fetchall()
                deleted_count = 0
                
                for record in existing_records:
                    file_path = record['file_path']
                    if file_path and not os.path.exists(file_path):
                        self._log(f"  [CLEANUP] Removing deleted file from DB: {file_path}")
                        delete_media(record['id'])
                        deleted_count += 1
                        
                if deleted_count > 0:
                    self._log(f"Cleanup finished: Removed {deleted_count} stale entries.")
                    
        except Exception as e:
            self._log(f"Error during file cleanup: {e}")

    def _scan_series_recursive(self, series_root: Path, series_name: str) -> List[Dict]:
        """Deep scan a specific series folder"""
        items = []
        try:
            for file_path in series_root.rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in VIDEO_EXTENSIONS:
                    # Check size
                    if file_path.stat().st_size < MIN_FILE_SIZE: continue
                    
                    # Manual Parse
                    parsed = self.parse_media_file(file_path, force_type='series', force_title=series_name)
                    if parsed:
                        items.append(parsed)
        except Exception as e:
            self._log(f"Error scanning series {series_name}: {e}")
        return items

    def _scan_flat_recursive(self, path: Path) -> List[Dict]:
        """Standard recursive scan without hierarchy enforcement"""
        items = []
        try:
            for file_path in path.rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in VIDEO_EXTENSIONS:
                     if file_path.stat().st_size < MIN_FILE_SIZE: continue
                     parsed = self.parse_media_file(file_path)
                     if parsed: items.append(parsed)
        except Exception as e:
            self._log(f"Error flat scanning {path}: {e}")
        return items
    
    def _identify_folder_type(self, folder_name: str) -> str:
        """
        Check online if the folder name corresponds to a TV Series or a Movie.
        Uses multi-source verification (TMDb + Google) for accuracy.
        Returns 'series', 'movie', or 'unknown'.
        """
        # STRICT PATH-BASED DETECTION
        # Check full path for keywords (case-insensitive)
        # We need the full path here, but this method currently only gets folder_name.
        # We will modify the caller to pass the full path or handle it there.
        # However, for now, let's check if the folder_name itself contains these keywords
        # or if we can infer it. 
        
        # Actually, the user said "E:\HDD_EXTERNAL\MOVIES", so we should check the parent directories too.
        # The current method signature is `_identify_folder_type(self, folder_name: str)`.
        # We should update `parse_media_file` to handle this logic before calling `_identify_folder_type`
        # or pass the full path to `_identify_folder_type`.
        
        # Let's keep this method as is for now and handle the strict logic in `parse_media_file` 
        # where we have access to the full `file_path`.
        
        if folder_name in self.folder_type_cache:
            return self.folder_type_cache[folder_name]

        # Clean folder name
        clean_name = self._clean_filename(folder_name)
        
        # Check if it looks like a season folder (quick pattern check)
        if re.search(r'(season|موسم)\s*\d+', folder_name.lower()):
            self.folder_type_cache[folder_name] = 'series'
            self._log(f"Folder '{folder_name}' identified as SERIES (pattern match)")
            return 'series'

        # Search both TMDb sources
        is_arabic = any('\u0600' <= c <= '\u06FF' for c in clean_name)
        lang = 'ar-SA' if is_arabic else None
        
        tv_result = self.fetcher.search_tv(clean_name, language=lang)
        movie_result = self.fetcher.search_movie(clean_name, language=lang)

        # Use multi-source verifier for enhanced accuracy
        verification = self.verifier.get_confidence_score(
            clean_name,
            tmdb_movie=bool(movie_result),
            tmdb_tv=bool(tv_result)
        )
        
        final_type = verification['type']
        confidence = verification['confidence']
        
        # Log result with confidence
        if final_type == 'series':
            self._log(f"Folder '{folder_name}' identified as SERIES (confidence: {confidence}%)")
        elif final_type == 'movie':
            self._log(f"Folder '{folder_name}' identified as MOVIE (confidence: {confidence}%)")
        else:
            self._log(f"Folder '{folder_name}' type unknown (confidence: {confidence}%)")
        
        # Cache result
        self.folder_type_cache[folder_name] = final_type
        return final_type

    def parse_media_file(self, file_path: Path, force_type: str = None, force_title: str = None) -> Dict:
        """Parse a media file and extract metadata from filename"""
        from scan_status import scan_status
        scan_status.update_progress(file_path.name, status='processing')
        
        filename = file_path.stem
        folder_name = file_path.parent.name
        
        # Get file info
        file_info = {
            'file_path': os.path.normpath(str(file_path)),
            'folder_path': os.path.normpath(str(file_path.parent)),
            'format': file_path.suffix[1:].upper(),
            'size_bytes': file_path.stat().st_size,
        }
        
        # Detect quality
        file_info['quality'] = self._detect_quality(filename)
        
        # Clean filename
        clean_name = self._clean_filename(filename)
        
        # Determine Folder/Media Type
        if force_type:
             folder_type = force_type
             self._log(f"Hierarchy Rule: '{filename}' forced to {folder_type.upper()}")
        else:
            # STRICT PATH DETECTION (Centralized)
            from classification import classify_media_type
            strict_type = classify_media_type(str(file_path))
            
            if strict_type == 'movie':
                folder_type = 'movie'
                self._log(f"Strict Path Rule: '{filename}' forced to MOVIE")
            elif strict_type == 'series':
                folder_type = 'series'
                self._log(f"Strict Path Rule: '{filename}' forced to SERIES")
            else:
                folder_type = 'unknown' 
                self._log(f"Strict Path Rule: '{filename}' detected as UNKNOWN (Not in MOVIES/SERIES folder).")
            
        is_series_folder = (folder_type == 'series')
        
        # Try to detect episode info first
        # Pass force_title as series_name hint if available
        episode_info = self._detect_episode(filename, folder_name, series_hint=force_title)
        
        # If folder is definitely a series but regex failed, treat as simple episode
        if not episode_info and is_series_folder:
             # Try to find any number in filename
             num_match = re.search(r'(\d+)', filename)
             ep_num = int(num_match.group(1)) if num_match else 1
             
             episode_info = {
                'series_name': folder_name, # Use folder name as series title
                'season': 1,   # Default season
                'episode': ep_num,
             }

        if episode_info:
            # It's an episode
            file_info.update({
                'type': 'episode',
                'title': episode_info['series_name'],
                'season_number': episode_info['season'],
                'episode_number': episode_info['episode'],
                'episode_title': episode_info.get('episode_title'),
            })
        else:
            # It's a movie - try to detect if it's part of a franchise
            movie_info = self._parse_movie(clean_name, folder_name)
            file_info.update({
                'type': 'movie',
                'title': movie_info['title'],
                'year': movie_info.get('year'),
                'original_title': movie_info.get('original_title'),
            })
            
            # Check if part of a franchise (e.g., "Harry Potter 2001 (1)")
            franchise_info = self._detect_franchise(filename, folder_name)
            if franchise_info:
                file_info['franchise'] = franchise_info['franchise']
                file_info['franchise_order'] = franchise_info['order']
        
        # FFmpeg Deep Scan for Missing Data (Strict Requirement)
        # Use centralized ffmpeg_utils which returns dict with 'duration', 'width', 'height', etc.
        try:
            from ffmpeg_utils import get_video_info
            
            # Helper to map width to quality tag
            def map_width_to_quality(width):
                if not width: return 'Unknown'
                if width >= 3000: return '4K'
                if width >= 1800: return '1080p'
                if width >= 1200: return '720p'
                if width >= 700: return '576p'
                return '480p'

            from database import get_media_by_path
            existing = get_media_by_path(str(file_path))
            
            if existing and existing.get('size_bytes') == file_info['size_bytes'] and existing.get('duration'):
                # Fast Path: File hasn't changed, skip expensive FFprobe
                file_info['duration'] = existing['duration']
                file_info['quality'] = existing.get('quality', file_info.get('quality'))
                if existing.get('width'): file_info['width'] = existing['width']
                if existing.get('height'): file_info['height'] = existing['height']
                self._log(f"Fast Scan: Skipped probe for unchanged file '{filename}'")
            else:
                # MANDATORY PROBE: First scan or file changed
                probe_info = get_video_info(str(file_path))
                
                if probe_info:
                    # 1. Fix Duration (Critical)
                    duration = probe_info.get('duration')
                    if duration and float(duration) > 0:
                        file_info['duration'] = int(float(duration))
                    else:
                        self._log(f"Deep Scan: Warning - Zero duration for {filename}. Marking as corrupt.")
                        scan_status.log_failure(str(file_path), "Zero-duration or unreadable video file")
                        return None
                    
                    # 2. Fix Quality/Resolution
                    if 'width' in probe_info and probe_info['width']:
                        file_info['quality'] = map_width_to_quality(probe_info['width'])
                        file_info['width'] = probe_info['width']
                        file_info['height'] = probe_info.get('height')
                        
                    self._log(f"Deep Scan: {filename} -> {file_info.get('duration')}s / {file_info.get('quality')}")
                else:
                    self._log(f"Deep Scan: Warning - No info returned for {filename}. Marking as corrupt.")
                    scan_status.log_failure(str(file_path), "Corrupt or unreadable file (FFmpeg probe failed)")
                    return None
                
        except Exception as e:
            self._log(f"FFprobe Deep Scan failed for {filename}: {e}")
            scan_status.log_failure(str(file_path), f"Probe exception: {str(e)}")
            return None

        # Automatic Collection Detection
        # Check if parent folder contains "Collection"
        collection_name = None
        path_parts = file_path.parts
        
        # Check immediate parent (e.g. "John Wick Collection")
        if 'collection' in folder_name.lower():
            collection_name = re.sub(r'\s+collection', '', folder_name, flags=re.IGNORECASE).strip()
            
        # Check grandparent folder (useful for Series/Seasons inside a collection folder)
        elif len(path_parts) > 2 and 'collection' in path_parts[-3].lower():
            img_parent = path_parts[-3]
            collection_name = re.sub(r'\s+collection', '', img_parent, flags=re.IGNORECASE).strip()
            
        if collection_name and len(collection_name) > 2:
            file_info['collection_name'] = collection_name
            self._log(f"Detected Collection: '{collection_name}' for {filename}")

        return file_info
    
    def _clean_filename(self, filename: str) -> str:
        """
        Aggressive 'Clean-Search' Regex Engine.
        Strips prefixes, suffixes, sites, and quality tags.
        """
        clean = filename
        
        # 0. Pre-clean: Remove Extension FIRST
        # Also handle double extensions or "mkv" inside text
        base, ext = os.path.splitext(clean)
        # Recurse for double extensions like .web-dl.mp4
        if ext.lower() in VIDEO_EXTENSIONS:
            clean = base
        base2, ext2 = os.path.splitext(clean)
        if ext2.lower() in VIDEO_EXTENSIONS:
            clean = base2
            
        # 1. Normalize Separators (Dots to spaces)
        clean = re.sub(r'[._-]+', ' ', clean) 
        clean = re.sub(r'\s+', ' ', clean).strip()
        
        # 2. Remove Handle/Social References
        clean = re.sub(r'@\w+', '', clean)
        clean = re.sub(r'(?:join|follow)\s+(?:us|me)?\s*(?:on)?\s*\w+', '', clean, flags=re.IGNORECASE)

        # 3. Remove specific Prefixes/Groups
        clean = re.sub(r'^(?:AWFR\d+|[A-Z]+\d{2,})\s+', '', clean, flags=re.IGNORECASE)
        # Remove groups like [CimaClub.Com]
        clean = re.sub(r'\[.*?\]', '', clean)
        # Remove loose brackets
        clean = re.sub(r'[\[\]]', '', clean)
        
        # 4. Remove Arabic Phrases
        arabic_phrases = [
            r'فيلم', r'مسلسل', r'مترجم اون لاين', r'فاصل إعلاني', 
            r'مترجم', r'حصرياً', r'انتاج', r'جودة عالية',
            r'اون لاين', r'مدبلج', r'للعربية', r'كامل', r'تحميل', r'مشاهدة',
            r'بدقة', r'عالية', r'نسخة'
        ]
        for phrase in arabic_phrases:
            clean = re.sub(phrase, '', clean)
            
        # 5. Remove Site Names
        for pattern in SITE_PATTERNS:
            clean = re.sub(pattern, '', clean, flags=re.IGNORECASE)
            
        # 6. Remove Noise / Quality / Scene Tags
        # Improved regex to catch "WEB.DL" which became "WEB DL"
        noise_patterns = [
            r'\b(?:WEB[\s.-]*DL|WEB[\s.-]*Rip|Blu[\s.-]*Ray|Remux|HDTV|CAM|HDCAM|TS|DVD|DVDRip|HDRip|HD)\b',
            r'\b(?:4K|2160p|1080p|720p|480p|576p|UHD|FHD|SD)\b',
            r'\b(?:x264|x265|HEVC|H\.?264|H\.?265|AVC)\b',
            r'\b(?:AAC|AC3|DTS|TrueHD|Atmos|DD\+?|5\.1|7\.1|2\.0|2CH|6CH)\b',
            r'\b(?:10bit|8bit|HDR|HDR10|DV|Dolby|Vision)\b',
            r'\b(?:PSA|RARBG|YIFY|YiFY|YTS|Pahe|QxR|Joy|UTR|Pixel|VXT|Kingdom|Release|KRaLiM|AKWAM)\b',
            r'\b(?:COMPLETE|Shahid4U|LiMiTED|UNRATED|DIRECTORS?[\s.]*CUT|EXTENDED|REMASTERED|THEATRICAL|DC|NF|AMZN|HULU)\b',
            r'\b(?:mkv|mp4|avi|wmv)\b', 
        ]
        
        for pattern in noise_patterns:
            clean = re.sub(pattern, '', clean, flags=re.IGNORECASE)

        # 7. Post-clean garbage
        # Remove "Shahid4U CoM" artifacts
        clean = re.sub(r'\b(com|net|org|app)\b', '', clean, flags=re.IGNORECASE)
        
        # Remove trailing random numbers (720, 57393) often left over
        # BUT EXCLUDE YEARS (4 digits 19xx or 20xx)
        clean = re.sub(r'\s+(?!(?:19|20)\d{2})\d{3,}\s*$', '', clean)
        
        # Remove standalone resolutions like " 720 " or " 1080 "
        # We must be careful not to kill "2023" (Year).
        # Safe way: Remove 3-4 digits ONLY if they appear in the noise list context or are specific known resolutions
        clean = re.sub(r'\b(1080|720|480|576|2160)\b', '', clean)

        # Clean up whitespace
        clean = re.sub(r'\s+', ' ', clean).strip()
        
        # Remove leading/trailing non-word characters (punctuation etc)
        # Use \W but allow () and Arabic chars. \W in Python 3.x is unicode-aware (i.e. matches non-letters).
        # Actually \w matches Arabic letters. So \W matches punctuation/symbols.
        clean = re.sub(r'^[^\w(]+', '', clean)
        clean = re.sub(r'[^\w)]+$', '', clean)
        
        return clean
    
    def _detect_quality(self, filename: str) -> str:
        """Detect video quality from filename"""
        lower_name = filename.lower()
        
        # 4K / UHD
        if any(x in lower_name for x in ['2160p', '4k', 'uhd', 'UltraHD']):
            return '4K'
            
        # 1080p
        if any(x in lower_name for x in ['1080p', 'fhd', 'fullhd']):
            return '1080p'
            
        # 720p
        if '720p' in lower_name:
            return '720p'

        # 480p/576p/DVD
        if any(x in lower_name for x in ['480p', '576p', 'dvd', 'sd']):
            return '480p'
            
        # Enhanced Regex for generic patterns like " 1080 "
        import re
        match = re.search(r'[^0-9](\d{3,4})p', lower_name)
        if match:
            return f"{match.group(1)}p"
            
        return 'Unknown'

    def probe_quality(self, file_path):
        """Use FFprobe to detect real resolution (Slow but accurate)"""
        try:
            import subprocess
            from pathlib import Path
            if isinstance(file_path, Path):
                file_path = str(file_path)
                
            cmd = [
                'ffprobe', 
                '-v', 'error', 
                '-select_streams', 'v:0', 
                '-show_entries', 'stream=width,height', 
                '-of', 'csv=s=x:p=0', 
                file_path
            ]
            # Run with timeout to prevent hanging
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10, encoding='utf-8', errors='replace')
            output = result.stdout.strip()
            
            if output and 'x' in output:
                try:
                    parts = output.split('x')
                    width = int(parts[0])
                    # height = int(parts[1])
                    
                    if width >= 3000: return '4K'
                    if width >= 1800: return '1080p'
                    if width >= 1200: return '720p'
                    if width >= 700: return '576p'
                    return '480p'
                except:
                    pass
        except Exception as e:
            print(f"Probe failed for {file_path}: {e}")
            
        return 'Unknown'
    
    def _detect_episode(self, filename: str, folder_name: str, series_hint: str = None) -> Optional[Dict]:
        """Detect if file is a TV episode and extract info"""
        
        extracted = None
        
        # Pattern 1: S01E02 or S1E2
        match = re.search(r'[.\s_-]?S(\d{1,2})[.\s_-]?E(\d{1,2})', filename, re.IGNORECASE)
        if match:
            extracted = {
                'season': int(match.group(1)),
                'episode': int(match.group(2)),
            }
        
        # Pattern 2: Season 1 Episode 2
        elif re.search(r'Season\s*(\d+)\s*Episode\s*(\d+)', filename, re.IGNORECASE):
            match = re.search(r'Season\s*(\d+)\s*Episode\s*(\d+)', filename, re.IGNORECASE)
            extracted = {
                'season': int(match.group(1)),
                'episode': int(match.group(2)),
            }

        # Pattern 3: Specific Arabic Format "(مسلسل) Name الموسم X - الحلقة Y"
        # Matches: "مسلسل Hijack الموسم الاول" OR "Hijack الموسم الاول"
        # We try to extract Series Name here because folder structure might be flat
        elif re.search(r'(?:مسلسل\s*)?(.*?)\s*الموسم\s*([\u0600-\u06FF]+|\d+).*?الحلق[ةه]\s*([\u0600-\u06FF]+|\d+)', filename):
            match = re.search(r'(?:مسلسل\s*)?(.*?)\s*الموسم\s*([\u0600-\u06FF]+|\d+).*?الحلق[ةه]\s*([\u0600-\u06FF]+|\d+)', filename)
            series_title = match.group(1).strip()
            # Clean up series title (remove " مترجم", " 2023", etc)
            series_title = self._clean_filename(series_title)
            
            extracted = {
                'season': self._arabic_to_number(match.group(2)),
                'episode': self._arabic_to_number(match.group(3)),
                'series_name': series_title, # Return extraction
            }
            
        # Pattern 4: Generic Arabic "الموسم X الحلقة Y" (Fallback)
        elif re.search(r'الموسم\s*([\u0600-\u06FF]+|\d+)', filename) and re.search(r'الحلق[ةه]\s*([\u0600-\u06FF]+|\d+)', filename):
            season_match = re.search(r'الموسم\s*([\u0600-\u06FF]+|\d+)', filename)
            episode_match = re.search(r'الحلق[ةه]\s*([\u0600-\u06FF]+|\d+)', filename)
            extracted = {
                'season': self._arabic_to_number(season_match.group(1)),
                'episode': self._arabic_to_number(episode_match.group(1)),
            }
            
        # Pattern 5: Arabic "Episode Only" (No Season info)
        # Matches: "مسلسل_الحشاشين_الحلقة_3" or "مشاهدة_مسلسل_بالطو_حلقة_10"
        # Defaults to Season 1
        elif re.search(r'(?:مشاهدة[._\s-]*)?(?:مسلسل[._\s-]*)?(.*?)[._\s-]+(?:حلقة|الحلقة)[._\s-]+(\d+)', filename):
            match = re.search(r'(?:مشاهدة[._\s-]*)?(?:مسلسل[._\s-]*)?(.*?)[._\s-]+(?:حلقة|الحلقة)[._\s-]+(\d+)', filename)
            series_title = match.group(1).strip()
            # Handle underscores in title
            series_title = series_title.replace('_', ' ')
            series_title = self._clean_filename(series_title)
            
            extracted = {
                'season': 1, # Default to S1
                'episode': int(match.group(2)),
                'series_name': series_title,
            }

        # Pattern 6: Folder contains season info (S01) + File contains E01
            
        # Pattern 5: Folder contains season info (S01) + File contains E01
        elif re.search(r'(?:^|[.\s_-])S(\d{1,2})(?:$|[.\s_-])', folder_name, re.IGNORECASE) and re.search(r'(?:^|[.\s_-])E(\d{1,2})', filename, re.IGNORECASE):
            folder_season = re.search(r'(?:^|[.\s_-])S(\d{1,2})(?:$|[.\s_-])', folder_name, re.IGNORECASE)
            ep_match = re.search(r'(?:^|[.\s_-])E(\d{1,2})', filename, re.IGNORECASE)
            extracted = {
                'season': int(folder_season.group(1)),
                'episode': int(ep_match.group(1)),
            }
            
        # Pattern 6: "Season 1" or "S01" Folder + "1.mp4" or "Episode 1.mp4"
        elif re.search(r'(?:season|موسم|s\d{1,2})', folder_name, re.IGNORECASE):
            # Try to grab season from folder
            season = 1
            s_match = re.search(r'(?:season\s*|موسم\s*|s)(\d{1,2})', folder_name, re.IGNORECASE)
            if s_match: season = int(s_match.group(1))
            
            # Try to grab episode from filename
            # Match strictly numbers or "Episode X"
            ep_match = re.search(r'(?:^|[.\s_-])(?:E|Episode)?\s*(\d{1,3})(?:$|[.\s_-])', filename, re.IGNORECASE)
            if ep_match:
                 extracted = {
                    'season': season,
                    'episode': int(ep_match.group(1)),
                }

        # Finalize extraction with Series Name
        if extracted:
            if series_hint:
                # USE HINT STRICTLY
                extracted['series_name'] = series_hint
            elif 'series_name' not in extracted:
                # Fallback to extraction from filename (Legacy)
                # This needs `match` object from above, but we split logic. 
                # Simplest way: use clean_filename on everything before the match
                # But since we have multiple patterns, let's just default to folder_name or clean filename
                extracted['series_name'] = folder_name
                
                # Try to extract name from filename if possible (best effort)
                # (Skipping complex reversal logic for now to ensure stability)
                
            return extracted
            
        return None
        


        return None
    
    def _extract_series_name(self, filename: str, end_pos: int) -> str:
        """Extract series name from before the season/episode marker"""
        name_part = filename[:end_pos]
        clean = self._clean_filename(name_part)
        
        # Remove year if at end
        clean = re.sub(r'\s*\(?\d{4}\)?$', '', clean)
        
        return clean.strip()
    
    def _is_series_folder(self, folder_name: str) -> bool:
        """Check if folder name suggests it contains a series"""
        # Common series indicators
        series_indicators = [
            r'season', r'موسم', r'complete', r'series',
            r's\d{1,2}', r'الموسم', r'مسلسل', r'episodes?',
        ]
        folder_lower = folder_name.lower()
        return any(re.search(pattern, folder_lower, re.IGNORECASE) for pattern in series_indicators)
    
    def _arabic_to_number(self, text: str) -> int:
        """Convert Arabic ordinal to number"""
        text = text.strip()
        
        # If it's already a number
        if text.isdigit():
            return int(text)
        
        # Check Arabic number mapping
        for arabic, num in ARABIC_NUMBERS.items():
            if arabic in text:
                return num
        
        return 1  # Default
    
    def _parse_movie(self, clean_name: str, folder_name: str) -> Dict:
        """Parse movie title and year"""
        result = {'title': clean_name}
        
        # Try to extract year
        year_match = re.search(r'(\d{4})', clean_name)
        if year_match:
            year = int(year_match.group(1))
            if 1900 <= year <= 2030:
                result['year'] = year
                # Remove year from title
                result['title'] = clean_name[:year_match.start()].strip()
                if not result['title']:
                    result['title'] = clean_name[year_match.end():].strip()
        
        # If title is still empty, use folder name
        if not result['title'] or len(result['title']) < 2:
            result['title'] = self._clean_filename(folder_name)
        
        # Clean up title
        result['title'] = re.sub(r'[-_()]+$', '', result['title']).strip()
        
        return result
    
    def _detect_franchise(self, filename: str, folder_name: str) -> Optional[Dict]:
        """Detect if movie is part of a franchise"""
        
        # Pattern: "Harry Potter 2001 (1)" or "John.Wick.3"
        match = re.search(r'(\d+)\s*\)?$', filename)
        if match:
            order = int(match.group(1))
            if 1 <= order <= 20:  # Reasonable franchise number
                # Extract franchise name
                franchise_name = self._clean_filename(filename[:match.start()])
                franchise_name = re.sub(r'\s*\d{4}\s*\(?$', '', franchise_name).strip()
                if franchise_name:
                    return {
                        'franchise': franchise_name,
                        'order': order,
                    }
        
        # Check folder name for franchise hints
        folder_clean = self._clean_filename(folder_name)
        if folder_clean:
            # Multiple files in same folder might be a franchise
            return {
                'franchise': folder_clean,
                'order': None,  # Will be sorted by year or filename
            }
        
        return None
    
    def _group_episodes(self, media_files: List[Dict]) -> List[Dict]:
        """Group episodes into series entries"""
        series_map = {}  # series_name -> {info, episodes}
        result = []
        
        for media in media_files:
            if media['type'] == 'episode':
                series_name = media['title'].lower()
                
                if series_name not in series_map:
                    # FIX: Ensure we use the root series folder, not the season folder
                    folder_path = media['folder_path']
                    folder_name = os.path.basename(folder_path)
                    if re.search(r'^(season|موسم)\s*\d+$', folder_name, re.IGNORECASE) or folder_name.lower() in ['specials', 'bonus']:
                        folder_path = os.path.dirname(folder_path)

                    series_map[series_name] = {
                        'info': {
                            'type': 'series',
                            'title': media['title'],
                            'folder_path': folder_path,
                            'quality': media['quality'],
                        },
                        'episodes': []
                    }
                
                series_map[series_name]['episodes'].append(media)
            else:
                result.append(media)
        
        # Convert series map to list
        for series_name, data in series_map.items():
            # Sort episodes
            data['episodes'].sort(key=lambda x: (x.get('season_number', 0), x.get('episode_number', 0)))
            
            # Add series info
            series_entry = data['info']
            series_entry['episodes'] = data['episodes']
            series_entry['total_seasons'] = max(ep.get('season_number', 1) for ep in data['episodes'])
            series_entry['total_episodes'] = len(data['episodes'])
            result.append(series_entry)
        
        return result

    def ingest_results(self, media_files: List[Dict]):
        """Ingest scan results into database (With Orphan Adoption)"""
        pass # Placeholder to be replaced by full logic below
        
        from database import add_media, get_media_by_path, get_media_by_folder_path, update_media_metadata
        from scan_status import scan_status
        
        print(f"Ingesting {len(media_files)} items...")
        
        for media in media_files:
            try:
                # Check Lock/Existing using correct path matching function
                if media['type'] == 'series':
                    # Series: Match by folder_path
                    check_path = media.get('folder_path')
                    existing = get_media_by_folder_path(check_path)
                else:
                    # Movie/other: Match by exact file_path ONLY
                    check_path = media['file_path']
                    existing = get_media_by_path(check_path)
                
                # Check 2: Parent Path Match (For Series with Season folders)
                # If we scanned "Show/Season 1", but DB has "Show", we must detect it.
                if not existing and media['type'] == 'series':
                    import re
                    folder_name = os.path.basename(check_path)
                    # If folder is "Season X", check parent
                    if re.search(r'^(season|موسم)\s*\d+$', folder_name, re.IGNORECASE) or folder_name.lower() in ['specials', 'bonus']:
                        parent_path = os.path.dirname(check_path)
                        existing = get_media_by_folder_path(parent_path)
                        if existing:
                            print(f"Found existing series by parent path: {parent_path} (ID: {existing['id']})")

                # Remove Title Check (As requested by user: Path Only)
                
                title = media.get('title', 'Unknown')

                if existing:
                    if existing['type'] == 'series':
                        # FIX: Even if series is locked (e.g. user matched TMDB ID or locked metadata),
                        # we MUST STILL scan and add/update episodes found on disk for this series!
                        if existing.get('locked'):
                            print(f"[LOCKED SERIES SCAN] Series '{title}' (ID: {existing['id']}) metadata is locked, but scanning/updating episodes...")
                        else:
                            print(f"Updating existing series: {title} (ID: {existing['id']})")
                            
                            # CHECK FOR MISSING CAST (Backfill on Rescan for unlocked series)
                            if existing.get('tmdb_id'):
                                try:
                                    from database import get_connection
                                    with get_connection() as conn:
                                        cursor = conn.cursor()
                                        cursor.execute("SELECT 1 FROM media_cast WHERE media_id = ? LIMIT 1", (existing['id'],))
                                        has_cast = cursor.fetchone()
                                        
                                        if not has_cast:
                                            print(f"[CAST BACKFILL] Found existing item with missing cast: {title}")
                                            self.fetcher.fetch_and_save_cast(
                                                media_id=existing['id'],
                                                tmdb_id=existing['tmdb_id'],
                                                media_type=existing['type'],
                                                limit=10
                                            )
                                except Exception as e:
                                    print(f"Error checking cast for {title}: {e}")

                        # Add Episodes (safely handles existing ones)
                        series_id = existing['id']
                        from database import add_media, get_connection
                        for ep in media.get('episodes', []):
                            ep['series_id'] = series_id
                            try:
                                add_media(ep)
                            except Exception as e:
                                print(f"Error adding episode {ep.get('title')}: {e}")
                        
                        # Update total_episodes count on the series record
                        try:
                            with get_connection() as conn:
                                cursor = conn.cursor()
                                cursor.execute("UPDATE media SET total_episodes = (SELECT COUNT(*) FROM media WHERE series_id = ?) WHERE id = ?", (series_id, series_id))
                                conn.commit()
                        except Exception as e:
                            print(f"Error updating total_episodes count for series {series_id}: {e}")

                        continue # Now we can continue, as episodes are handled

                    # For movies / non-series
                    if existing.get('locked'):
                        print(f"Skipping locked movie: {title} (ID: {existing['id']})")
                        continue

                    # CHECK FOR MISSING COLLECTION (Saga Backfill)
                    if existing['type'] == 'movie' and existing.get('tmdb_id') and not existing.get('collection_tmdb_id'):
                        try:
                            details = self.fetcher.get_movie_details(existing['tmdb_id'])
                            if details and details.get('belongs_to_collection'):
                                col_data = details['belongs_to_collection']
                                print(f"[COLLECTION BACKFILL] Found missing collection for {title}: {col_data.get('name')}")
                                from collections_api import process_movie_collection
                                process_movie_collection(existing['id'], col_data)
                        except Exception as e:
                            print(f"Error checking collection for {title}: {e}")

                    print(f"Skipping existing movie: {title} (ID: {existing['id']})")
                    continue
                
                # ADOPTION LOGIC
                orphan_id = self.find_orphan_candidate(media['type'], title, media.get('year'))
                
                if orphan_id:
                    print(f"[ADOPT] Orphan {orphan_id} adopting new file: {title}")
                    # Update orphan path
                    update_data = {
                        'file_path': media.get('file_path'),
                        'folder_path': media.get('folder_path'),
                        'size_bytes': media.get('size_bytes'),
                        'quality': media.get('quality')
                    }
                    update_media_metadata(orphan_id, update_data)
                    scan_status.update_progress(f"Restored: {title}", status='processing')
                    continue
                    
                # NEW ENTRY
                scan_status.update_progress(f"Saving: {title}", status='processing')
                
                # Metadata Fetch checking
                # For Series
                if media['type'] == 'series':
                    meta = self.fetcher.search_tv(title)
                    if meta:
                        meta = self.fetcher.cache_images(meta)
                        media.update(meta)
                    
                    sid = add_media(media)
                    # Add Episodes
                    for ep in media.get('episodes', []):
                        ep['series_id'] = sid
                        add_media(ep)
                        
                else:
                    # Movie
                    meta = self.fetcher.search_movie(title, media.get('year'))
                    if meta:
                         meta = self.fetcher.cache_images(meta)
                         media.update(meta)
                    media_id = add_media(media)
                    
                    # Process collection if exists
                    if meta and meta.get('collection'):
                        try:
                            from collections_api import process_movie_collection
                            process_movie_collection(media_id, meta['collection'])
                        except Exception as ce:
                            print(f"Collection error for {title}: {ce}")
                            
                # Auto-download subtitle if enabled or API key exists
                from database import get_setting
                auto_dl = get_setting('subtitle_auto_download', '0') == '1'
                api_key = get_setting('opensubtitles_api_key', '')
                if auto_dl or api_key:
                    import threading
                    from opensubtitles import auto_download_arabic_subtitle
                    
                    if media['type'] == 'series':
                        # Download for episodes
                        for ep in media.get('episodes', []):
                            # Ensure we have the episode's ID
                            if 'id' in ep:
                                threading.Thread(target=auto_download_arabic_subtitle, args=(ep['id'],), daemon=True).start()
                    else:
                        # Download for movie
                        if 'media_id' in locals():
                            threading.Thread(target=auto_download_arabic_subtitle, args=(media_id,), daemon=True).start()
                    
            except Exception as e:
                self._log(f"Error ingesting {media.get('title', 'unknown')}: {e}", level='ERROR')

    def _cleanup_missing_files(self, directory: str):
        """Remove database entries for files that no longer exist in the directory"""
        try:
            from database import get_connection, delete_media
            directory = str(Path(directory).resolve())
            
            print(f"Cleaning up missing files in: {directory}")
            
            with get_connection() as conn:
                cursor = conn.cursor()
                # Get all media in this directory (prefix match)
                cursor.execute("SELECT id, title, file_path, folder_path, type FROM media WHERE file_path LIKE ? OR folder_path LIKE ?", 
                             (f"{directory}%", f"{directory}%"))
                
                rows = cursor.fetchall()
                deleted_count = 0
                
                for row in rows:
                    mid = row['id']
                    file_path = row['file_path']
                    folder_path = row['folder_path']
                    media_type = row['type']
                    
                    should_delete = False
                    
                    if media_type == 'series':
                        # For series, check if folder exists
                        if folder_path and not os.path.exists(folder_path):
                            print(f"[CLEANUP] Missing Series Folder: {folder_path}")
                            should_delete = True
                    else:
                        # For movies/episodes, check file exists
                        if file_path and not os.path.exists(file_path):
                            print(f"[CLEANUP] Missing File: {file_path}")
                            should_delete = True
                            
                    if should_delete:
                        print(f"[CLEANUP] Removing {media_type}: {row['title']} (ID: {mid})")
                        delete_media(mid)
                        deleted_count += 1
                        
                if deleted_count > 0:
                    print(f"Cleanup complete. Removed {deleted_count} missing items.")
                    
        except Exception as e:
            print(f"Error during cleanup: {e}")

    def find_subtitles(self, video_path: str) -> List[str]:
        """Find subtitle files for a video"""
        video_path = Path(video_path)
        subtitles = []
        
        # Check for subtitles with same name
        for ext in SUBTITLE_EXTENSIONS:
            sub_path = video_path.with_suffix(ext)
            if sub_path.exists():
                subtitles.append(str(sub_path))
        
        # Check for subtitles in same folder with similar name
        video_stem = video_path.stem.lower()
        for file in video_path.parent.iterdir():
            if file.suffix.lower() in SUBTITLE_EXTENSIONS:
                if video_stem in file.stem.lower():
                    if str(file) not in subtitles:
                        subtitles.append(str(file))
        
        return subtitles


    @staticmethod
    def cleanup_ghost_series():
        """Remove invalid series entries detected as 'Season XX' or 'SXX'"""
        print("Starting Ghost Series Cleanup...")
        try:
           from database import get_connection, delete_media
           with get_connection() as conn:
               cursor = conn.cursor()
               cursor.execute("SELECT id, title FROM media WHERE type='series' AND (title LIKE 'Season %' OR title LIKE 'S%' OR title LIKE 'الموسم %')")
               potential_ghosts = [dict(row) for row in cursor.fetchall()]
               
               deleted_count = 0
               for row in potential_ghosts:
                   mid = row['id']
                   title = row['title']
                   
                   # Strict Regex Check
                   if re.match(r'^(Season|S)\s*\d+$', title, re.IGNORECASE) or re.match(r'^الموسم\s*\d+$', title):
                       print(f"Deleting Ghost Series: {title} (ID: {mid})")
                       delete_media(mid)
                       deleted_count += 1
                       
               print(f"Cleanup Complete: Removed {deleted_count} ghost series.")
               return deleted_count
               
        except Exception as e:
            print(f"Error cleaning ghost series: {e}")
            return 0

    def prune_orphans(self) -> int:
        """Delete media with no file_path and no folder_path (Broken entries)"""
        print("Starting Orphan Pruning (Broken Links)...")
        try:
            from database import get_connection, delete_media
            with get_connection() as conn:
                cursor = conn.cursor()
                # Find items with NO path
                cursor.execute("SELECT id, title, type FROM media WHERE (file_path IS NULL OR file_path = '') AND (folder_path IS NULL OR folder_path = '')")
                orphans = cursor.fetchall()
                
                deleted_count = 0
                for row in orphans:
                    print(f"[PRUNE] Deleting broken entry: {row['title']} (ID: {row['id']})")
                    delete_media(row['id'])
                    deleted_count += 1
                    
                if deleted_count > 0:
                    print(f"Pruning Complete: Removed {deleted_count} broken items.")
                return deleted_count
        except Exception as e:
            print(f"Error pruning orphans: {e}")
            return 0

    def find_orphan_candidate(self, media_type: str, title: str, year: int = None) -> Optional[int]:
        """Find an orphan (no path) media logic to adopt"""
        try:
            from database import get_connection
            with get_connection() as conn:
                cursor = conn.cursor()
                # Query matches Title AND Type AND (Path is Missing)
                # We optionally check Year if provided (fuzzy match or exact?)
                # Strict Year matching is safer to avoid adopting remakes.
                
                query = """
                    SELECT id FROM media 
                    WHERE type = ? 
                    AND title = ? 
                    AND (file_path IS NULL OR file_path = '') 
                    AND (folder_path IS NULL OR folder_path = '')
                """
                params = [media_type, title]
                
                if year:
                    query += " AND year = ?"
                    params.append(year)
                    
                cursor.execute(query, params)
                row = cursor.fetchone()
                if row:
                    return row['id']
                return None
        except Exception as e:
            print(f"Error finding orphan: {e}")
            return None


def scan_library_path(path: str) -> List[Dict]:
    """Convenience function to scan a library path"""
    scanner = MediaScanner()
    return scanner.scan_directory(path)


if __name__ == '__main__':
    # Test the scanner
    print("Running embedded test...")
    try:
        root_path = Path(r"H:\CINEMA WORLD\SERIES")
        target_series = "Black Mirror"
        series_path = root_path / target_series
        
        print(f"Testing Series Root: {series_path}")
        
        scanner = MediaScanner()
        series_name = scanner._clean_filename(series_path.name)
        print(f"Detected Series Name: {series_name}")
        
        files = scanner._scan_series_recursive(series_path, series_name)
        print(f"Found {len(files)} files.")
        
        with open('embedded_test_output.txt', 'w', encoding='utf-8') as f:
            f.write(f"Detected Series Name: {series_name}\n")
            for item in files[:10]:
                 f.write(f"  [{item['type'].upper()}] {item['title']} - S{item.get('season_number')}E{item.get('episode_number')}\n")
                 if item['title'] != series_name:
                    f.write(f"    ERROR: Title mismatch! Expected '{series_name}', got '{item['title']}'\n")

        print("Test complete. Check embedded_test_output.txt")
    except Exception as e:
        print(f"CRASH: {e}")
