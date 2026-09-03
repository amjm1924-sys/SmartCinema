from flask import Blueprint, jsonify, request
from database import get_library_stats
import psutil
import os
import sys
import threading
from datetime import datetime
import re

admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')

@admin_bp.route('/stats', methods=['GET'])
def get_admin_stats():
    """Get comprehensive system statistics"""
    stats = get_library_stats()
    disk_usage = psutil.disk_usage('/')
    
    return jsonify({
        'media': {
            'total': stats['movies'] + stats['series'] + stats['episodes'],
            'movies': stats['movies'],
            'series': stats['series'],
            'episodes': stats['episodes'],
            'total_size_gb': stats['total_size_gb']
        },
        'library': {
            'active_paths': 0,  # Simplified
            'hidden_items': 0   # Simplified
        },
        'system': {
            'disk_total_gb': round(disk_usage.total / (1024**3), 2),
            'disk_used_gb': round(disk_usage.used / (1024**3), 2),
            'disk_free_gb': round(disk_usage.free / (1024**3), 2),
            'disk_percent': disk_usage.percent
        }
    })

@admin_bp.route('/debug/path-check', methods=['GET'])
def debug_path_check():
    """Debug: Check what media is returned for a given path"""
    from database import get_connection
    
    path = request.args.get('path', r'H:\CINEMA WORLD\MOVIES\فيلم The Witch\فيلم The Witch 2015 مترجم اون لاين - فاصل إعلاني_x264.mp4')
    media_id = request.args.get('id', 544, type=int)
    
    result = {
        'query_path': path,
        'normalized_path': os.path.normpath(path),
        'lowered_path': os.path.normpath(path).lower(),
    }
    
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Check what ID 544 actually has
        cursor.execute('SELECT id, title, file_path, folder_path FROM media WHERE id = ?', (media_id,))
        row = cursor.fetchone()
        if row:
            result['id_544'] = {
                'id': row['id'],
                'title': row['title'],
                'file_path': row['file_path'],
                'folder_path': row['folder_path'],
            }
        
        # Check exact file_path match
        norm_path = os.path.normpath(path)
        cursor.execute('SELECT id, title, file_path FROM media WHERE lower(file_path) = ?', (norm_path.lower(),))
        row = cursor.fetchone()
        result['file_path_match'] = dict(row) if row else None
        
        # Check exact folder_path match
        cursor.execute('SELECT id, title, folder_path FROM media WHERE lower(folder_path) = ?', (norm_path.lower(),))
        row = cursor.fetchone()
        result['folder_path_match'] = dict(row) if row else None
        
        # Check any LIKE matches
        cursor.execute("SELECT id, title, file_path FROM media WHERE file_path LIKE ?", ('%witch%',))
        result['like_matches'] = [dict(r) for r in cursor.fetchall()[:10]]
        
    return jsonify(result)

@admin_bp.route('/debug/fix-metadata/<int:media_id>', methods=['POST'])
def debug_fix_metadata(media_id):
    """Fix media metadata by re-fetching from TMDb with improved search"""
    from database import get_media_by_id, update_media_metadata
    from metadata import MetadataFetcher
    from scanner import MediaScanner
    
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    # Extract clean title from file path
    scanner = MediaScanner()
    file_path = media.get('file_path', '')
    folder_name = os.path.basename(os.path.dirname(file_path))
    filename = os.path.basename(file_path)
    
    # Clean the filename
    clean_title = scanner._clean_filename(os.path.splitext(filename)[0])
    
    # Try to extract year
    year_match = re.search(r'(19|20)\d{2}', filename)
    year = int(year_match.group(0)) if year_match else None
    
    # Search TMDb with improved matching
    fetcher = MetadataFetcher()
    new_metadata = fetcher.search_movie(clean_title, year)
    
    if new_metadata:
        # Cache images
        new_metadata = fetcher.cache_images(new_metadata)
        # Update database
        update_media_metadata(media_id, new_metadata)
        return jsonify({
            'success': True,
            'old_title': media.get('title'),
            'new_title': new_metadata.get('title'),
            'clean_title_used': clean_title,
            'year_detected': year,
            'tmdb_id': new_metadata.get('tmdb_id')
        })
    else:
        return jsonify({
            'success': False,
            'message': 'No metadata found',
            'clean_title_used': clean_title,
            'year_detected': year
        })

@admin_bp.route('/system-stats', methods=['GET'])
def get_system_stats():
    """Get system information"""
    import platform
    
    # Check FFmpeg
    ffmpeg_available = os.path.exists(r"H:\ffmpeg-2025-08-20-git-4d7c609be3-full_build\bin\ffmpeg.exe")
    
    return jsonify({
        'python_version': platform.python_version(),
        'platform': platform.system(),
        'platform_version': platform.version(),
        'ffmpeg_available': ffmpeg_available,
        'database_size_mb': round(os.path.getsize('data/cinemastream.db') / (1024**2), 2) if os.path.exists('data/cinemastream.db') else 0
    })

@admin_bp.route('/errors', methods=['GET'])
def get_recent_errors():
    """Get recent errors from backend logs"""
    log_file = os.path.join(os.path.dirname(__file__), 'logs', 'backend.log')
    errors = []
    
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                # Read last 200 lines and filter for ERROR
                lines = f.readlines()[-200:]
                for line in lines:
                    if 'ERROR' in line or 'CRITICAL' in line or 'Exception' in line:
                         errors.append(line.strip())
        except Exception as e:
            errors.append(f"Error reading log file: {str(e)}")
            
    return jsonify({
        'errors': errors[-50:], # Return last 50 actual errors
        'message': 'Success'
    })

@admin_bp.route('/cache/clear', methods=['POST'])
def clear_cache():
    """Clear metadata cache"""
    import shutil
    
    cache_dir = 'data/cache'
    if os.path.exists(cache_dir):
        shutil.rmtree(cache_dir)
        os.makedirs(cache_dir)
        return jsonify({'success': True, 'message': 'Cache cleared'})
    
    return jsonify({'success': False, 'message': 'Cache directory not found'})

@admin_bp.route('/database/optimize', methods=['POST'])
def optimize_database():
    """Optimize database (VACUUM)"""
    from database import get_connection
    with get_connection() as conn:
        conn.execute('VACUUM')
    
    return jsonify({'success': True, 'message': 'Database optimized'})

@admin_bp.route('/reports/broken', methods=['GET'])
def get_broken_files():
    """Get report of broken files (missing from disk)"""
    from database import get_all_media
    import os
    
    broken = []
    all_media = get_all_media({}, 'title', 10000, 0)
    
    for item in all_media:
        path = item.get('file_path')
        if path and not os.path.exists(path):
            broken.append({
                'id': item['id'],
                'title': item['title'],
                'path': path,
                'issue': 'File not found'
            })
            
    return jsonify(broken)

@admin_bp.route('/reports/duplicates', methods=['GET'])
def get_duplicates_report():
    """Get report of duplicate media"""
    from database import get_connection
    
    report = {
        'tmdb_duplicates': [],
        'path_duplicates': []
    }
    
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # 1. Check TMDB ID Duplicates
        cursor.execute("""
            SELECT tmdb_id, type, COUNT(*) as cnt 
            FROM media 
            WHERE tmdb_id IS NOT NULL AND type IN ('movie', 'series')
            GROUP BY tmdb_id, type
            HAVING cnt > 1
        """)
        tmdb_dupes = cursor.fetchall()
        
        for dupe in tmdb_dupes:
            tmdb_id = dupe['tmdb_id']
            m_type = dupe['type']
            
            cursor.execute("SELECT * FROM media WHERE tmdb_id = ? AND type = ?", (tmdb_id, m_type))
            items = [dict(row) for row in cursor.fetchall()]
            
            report['tmdb_duplicates'].append({
                'tmdb_id': tmdb_id,
                'type': m_type,
                'count': len(items),
                'items': items
            })

        # 2. Check File Path Duplicates
        cursor.execute("""
            SELECT lower(file_path) as path, COUNT(*) as cnt 
            FROM media 
            WHERE file_path IS NOT NULL AND file_path != ''
            GROUP BY lower(file_path) 
            HAVING cnt > 1
        """)
        path_dupes = cursor.fetchall()

        for dupe in path_dupes:
            path = dupe['path'] # Lowercase
            cursor.execute("SELECT * FROM media WHERE lower(file_path) = ?", (path,))
            items = [dict(row) for row in cursor.fetchall()]
            
            report['path_duplicates'].append({
                'path': items[0]['file_path'], # Original case
                'count': len(items),
                'items': items
            })
            
    return jsonify(report)

@admin_bp.route('/reports/incomplete', methods=['GET'])
def get_incomplete_media():
    """Get report of incomplete media (missing metadata)"""
    from database import get_all_media
    
    incomplete = []
    all_media = get_all_media({}, 'title', 10000, 0)
    
    for item in all_media:
        issues = []
        if not item.get('overview'):
            issues.append('Missing overview')
        if not item.get('poster_url'):
            issues.append('Missing poster')
        if not item.get('backdrop_url'):
            issues.append('Missing backdrop')
        if not item.get('country'):
            issues.append('Missing country')
        if not item.get('runtime'):
            issues.append('Missing runtime')
        if not item.get('year'):
            issues.append('Missing year')
        if not item.get('quality') or item.get('quality') == 'Unknown':
            issues.append('Missing quality')
            
        if issues:
            incomplete.append({
                'id': item['id'],
                'title': item['title'],
                'issues': issues
            })
            
    return jsonify(incomplete)

@admin_bp.route('/reports/corrupted', methods=['GET'])
def get_corrupted_media():
    """Get report of corrupted media (0 duration/size)"""
    from database import get_connection
    corrupted = []
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM media WHERE file_path IS NOT NULL AND (duration IS NULL OR duration = 0 OR size_bytes IS NULL OR size_bytes < 1024)")
        rows = cursor.fetchall()
        for row in rows:
            item = dict(row)
            item['issue'] = 'Zero Duration' if not item['duration'] else 'Zero Size'
            item['exists'] = os.path.exists(item['file_path'])
            corrupted.append(item)
    return jsonify(corrupted)

@admin_bp.route('/reports/missing', methods=['GET'])
def get_missing_files():
    """Find video files on disk that are NOT in the database"""
    from database import get_library_paths, get_connection
    import os
    
    VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.m2ts'}
    
    # Get all file paths from database
    db_paths = set()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_path FROM media WHERE file_path IS NOT NULL")
        for row in cursor.fetchall():
            if row[0]:
                db_paths.add(os.path.normpath(row[0]).upper())
    
    # Scan disk
    missing_files = []
    library_paths = get_library_paths()
    
    for lib_info in library_paths:
        lib_path = lib_info['path']
        if not os.path.exists(lib_path):
            continue
        
        for root, dirs, files in os.walk(lib_path):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in VIDEO_EXTENSIONS:
                    full_path = os.path.normpath(os.path.join(root, file))
                    
                    # Check if in database
                    if full_path.upper() not in db_paths:
                        try:
                            size_mb = os.path.getsize(full_path) / (1024 * 1024)
                        except:
                            size_mb = 0
                        
                        # Determine skip reason
                        reason = 'Unknown'
                        if size_mb < 10:
                            reason = f'Size < 10MB ({size_mb:.1f} MB)'
                        elif size_mb < 75:
                            reason = f'Previously filtered (was < 75MB, now allowed): {size_mb:.1f} MB'
                        else:
                            reason = f'Classification/Path issue ({size_mb:.1f} MB)'
                        
                        missing_files.append({
                            'path': full_path,
                            'filename': file,
                            'size_mb': round(size_mb, 2),
                            'reason': reason
                        })
    
    return jsonify({
        'count': len(missing_files),
        'files': missing_files[:500]  # Limit to 500
    })

@admin_bp.route('/active_sessions', methods=['GET'])
def get_active_sessions():
    """Get active streaming sessions"""
    return jsonify([])

@admin_bp.route('/media', methods=['GET'])
def get_admin_media():
    """Get media for admin table"""
    """Get media for admin table"""
    from database import get_all_media, get_media_count
    
    limit = int(request.args.get('limit', 50))
    page = int(request.args.get('page', 1))
    offset = (page - 1) * limit
    
    # Extract filters
    filters = {}
    search_query = request.args.get('search')
    if search_query:
        filters['search'] = search_query
        
    type_filter = request.args.get('type')
    if type_filter and type_filter != 'all':
        filters['type'] = type_filter
    
    media = get_all_media(filters, 'title', limit, offset)
    total = get_media_count(filters)
    
    return jsonify({
        'media': media, 
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit,
        'limit': limit,
        'filters': filters
    })

@admin_bp.route('/logs', methods=['GET', 'POST'])
def handle_logs():
    """Get system logs or accept client logs"""
    log_dir = os.path.join(os.path.dirname(__file__), 'logs')
    os.makedirs(log_dir, exist_ok=True)
    
    if request.method == 'POST':
        # Accept client logs
        entry = request.json
        with open(os.path.join(log_dir, 'frontend.log'), 'a', encoding='utf-8') as f:
            timestamp = datetime.now().isoformat()
            f.write(f"[{timestamp}] {entry.get('level', 'INFO')}: {entry.get('message')}\n")
            if entry.get('stack'):
                f.write(f"Stack: {entry.get('stack')}\n")
        return jsonify({'success': True})
        
    # GET: Return combined logs
    parsed_logs = []
    
    # Priority log files to check
    log_files_to_check = ['latest_session.log', 'backend.log', 'frontend.log', 'repair.log']
    
    # Also add any session_*.log files in log_dir
    try:
        if os.path.exists(log_dir):
            for fn in os.listdir(log_dir):
                if fn.endswith('.log') and fn not in log_files_to_check:
                    log_files_to_check.append(fn)
    except Exception as e:
        print(f"Error listing log files: {e}")
        
    for log_filename in log_files_to_check:
        file_path = os.path.join(log_dir, log_filename)
        if not os.path.exists(file_path):
            continue
            
        try:
            mtime = datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
            logger_name = 'FRONTEND' if log_filename == 'frontend.log' else 'BACKEND'
            last_ts = mtime
            
            with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()[-300:] # Limit lines per file
                for line in lines:
                    line_str = line.strip()
                    if not line_str:
                        continue
                        
                    # Pattern 1: SessionLogger [2026-08-09T06:00:00] [LEVEL] msg
                    m1 = re.match(r'^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*)\]\s*\[(.*?)\]\s*(.*)$', line_str)
                    if m1:
                        last_ts = m1.group(1).replace('T', ' ')
                        parsed_logs.append({
                            'timestamp': last_ts,
                            'logger': logger_name,
                            'level': m1.group(2).upper(),
                            'message': m1.group(3)
                        })
                        continue
                        
                    # Pattern 2: Standard Python logging 2023-01-01 12:00:00,000 - LOGGER - LEVEL - MSG
                    m2 = re.match(r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[,.]?\d*)\s*-\s*(\S+)\s*-\s*(\S+)\s*-\s*(.*)$', line_str)
                    if m2:
                        last_ts = m2.group(1)
                        parsed_logs.append({
                            'timestamp': last_ts,
                            'logger': m2.group(2),
                            'level': m2.group(3).upper(),
                            'message': m2.group(4)
                        })
                        continue
                        
                    # Pattern 3: [ISO8601] LEVEL: MSG
                    m3 = re.match(r'^\[(.*?)\]\s*(\S+):\s*(.*)$', line_str)
                    if m3:
                        last_ts = m3.group(1).replace('T', ' ')
                        parsed_logs.append({
                            'timestamp': last_ts,
                            'logger': logger_name,
                            'level': m3.group(2).upper(),
                            'message': m3.group(3)
                        })
                        continue
                        
                    # Fallback for unformatted lines or stacktraces
                    parsed_logs.append({
                        'timestamp': last_ts,
                        'logger': logger_name,
                        'level': 'INFO',
                        'message': line_str
                    })
        except Exception as e:
            print(f"Error reading log file {log_filename}: {e}")

    # Sort by timestamp (Newest first)
    parsed_logs.sort(key=lambda x: x['timestamp'] or '0', reverse=True)

    return jsonify({'logs': parsed_logs[:500]})

@admin_bp.route('/health/advanced', methods=['GET'])
def advanced_health():
    """Advanced health check for admin dashboard"""
    try:
        import platform
        import shutil
        import subprocess
        
        # 1. System Resources
        cpu_percent = 0
        mem_percent = 0
        disk_info = {'free_gb': 0, 'percent': 0, 'total_gb': 0}
        
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            mem_percent = mem.percent
            
            try:
                # Use absolute path of CWD to be safe
                disk = psutil.disk_usage(os.path.abspath('.'))
            except:
                disk = psutil.disk_usage('/')
                
            disk_info = {
                'free_gb': round(disk.free / (1024**3), 2),
                'percent': disk.percent,
                'total_gb': round(disk.total / (1024**3), 2)
            }
        except Exception as e:
            print(f"Health Check: Resource Error: {e}")
        
        # 2. Database & FFmpeg
        ffmpeg_cmd = "ffmpeg"
        ffmpeg_version = None
        try:
            # Add timeout to prevent hang
            res = subprocess.run([ffmpeg_cmd, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=2)
            if res.returncode == 0:
                ffmpeg_version = res.stdout.split('\n')[0]
        except Exception as e:
            # print(f"Health Check: FFmpeg Error: {e}")
            pass
            
        # 3. Content Health
        from database import get_library_stats, get_connection
        
        stats = {'movies': 0, 'series': 0, 'episodes': 0}
        incomplete_count = 0
        db_status = 'Healthy'
        
        try:
            stats = get_library_stats()  # This accesses DB
            
            # Get corrupt/broken files
            # broken_files = [] 
            
            # Count items with missing country or runtime
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM media WHERE country IS NULL OR runtime IS NULL OR country = '' OR runtime = 0")
                result = cursor.fetchone()
                if result:
                    incomplete_count = result[0]
        except Exception as e:
            print(f"Health Check: DB Error: {e}")
            db_status = f"Error: {str(e)}"
        
        # 4. Alerts
        alerts = []
        if disk_info['percent'] > 90:
            alerts.append({'type': 'warning', 'message': 'Low Disk Space (>90%)'})
        if cpu_percent > 90:
            alerts.append({'type': 'warning', 'message': 'High CPU Usage'})
        if not ffmpeg_version:
            alerts.append({'type': 'error', 'message': 'FFmpeg not detected'})
        if db_status != 'Healthy':
             alerts.append({'type': 'error', 'message': 'Database Error'})
            
        health_score = 100
        if alerts: health_score -= (len(alerts) * 10)
        if incomplete_count > 0: health_score -= 5
        health_score = max(0, health_score)

        return jsonify({
            'health_score': health_score,
            'generated_at': datetime.now().isoformat(),
            'infrastructure': {
                'disk': disk_info,
                'internet': True, 
                'ffmpeg': ffmpeg_version,
                'database': db_status,
                'cpu': cpu_percent,
                'ram': mem_percent
            },
            'alerts': alerts,
            'content_health': {
                'corrupt_files': [],
                'missing_metadata': [],
                'missing_posters': [],
                'counts': {
                    'movies': stats.get('movies', 0),
                    'series': stats.get('series', 0),
                    'total': stats.get('movies', 0) + stats.get('series', 0) + stats.get('episodes', 0)
                }
            },
            'logs': {
                'recent_errors': []
            }
        })
    except Exception as e:
        import traceback
        with open("inspect_error.log", "w") as f:
            f.write(f"Error: {e}\n")
            f.write(traceback.format_exc())
        print(f"Inspect Error: {e}")
        traceback.print_exc()
        return jsonify({
            'error': 'Internal Server Error',
            'details': str(e),
            'health_score': 0,
            'infrastructure': {},
            'alerts': [{'type': 'critical', 'message': f'Health Check Failed: {str(e)}'}],
            'content_health': {'counts': {}}
        }), 500



@admin_bp.route('/media/<int:media_id>', methods=['GET', 'PUT', 'DELETE'])
def update_media(media_id):
    """Get, Update, or Delete media"""
    from database import get_media_by_id
    
    if request.method == 'GET':
        media = get_media_by_id(media_id)
        if not media:
            return jsonify({'error': 'Media not found'}), 404
        return jsonify(media)
        
    if request.method == 'DELETE':
        from database import delete_media
        try:
            delete_media(media_id)
            return jsonify({'success': True})
        except Exception as e:
            import traceback
            with open("delete_debug_err.log", "w") as f:
                f.write(traceback.format_exc())
            return jsonify({'error': str(e)}), 500
            
    data = request.json
    
    # CRITICAL: Lock manual edits
    data['locked'] = 1
    
    from database import update_media_metadata
    update_media_metadata(media_id, data)
    
    return jsonify({'success': True})


@admin_bp.route('/media/manual', methods=['POST'])
def add_manual_media():
    """Manually add a new media entry with custom metadata"""
    data = request.json
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    # Required fields
    if not data.get('title'):
        # Try to infer title from path if not provided
        if data.get('path'):
            import os
            filename = os.path.basename(data['path'])
            data['title'] = os.path.splitext(filename)[0]
        else:
            return jsonify({'error': 'Title is required'}), 400
    if not data.get('type'):
        return jsonify({'error': 'Type is required (movie/series)'}), 400
    
    from database import add_media
    from metadata import MetadataFetcher
    
    # Set locked = 1 for manual entries
    data['locked'] = 1
    
    # If TMDB ID provided, fetch and cache images
    if data.get('tmdb_id'):
        try:
            fetcher = MetadataFetcher()
            if data['type'] == 'movie':
                meta = fetcher.get_movie_details(data['tmdb_id'])
            else:
                meta = fetcher.get_tv_details(data['tmdb_id'])
            
            if meta:
                meta = fetcher.cache_images(meta)
                # Merge fetched metadata but keep user's title if provided
                user_title = data.get('title')
                data.update(meta)
                if user_title:
                    data['title'] = user_title
        except Exception as e:
            print(f"Error fetching metadata for manual entry: {e}")
    
    # Add to database
    try:
        media_id = add_media(data)
        return jsonify({'success': True, 'id': media_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@admin_bp.route('/search-tmdb', methods=['GET'])
def search_tmdb():
    """Search TMDB for matching"""
    query = request.args.get('query')
    media_type = request.args.get('type', 'movie')
    year = request.args.get('year', type=int)
    
    with open("search_log.txt", "a") as f:
        f.write(f"Search Request: query='{query}', type='{media_type}', year='{year}'\n")

    if not query:
        with open("search_log.txt", "a") as f:
            f.write("Empty query, returning []\n")
        return jsonify({'results': []})
        
    from metadata import MetadataFetcher
    fetcher = MetadataFetcher()
    
    results = []
    try:
        if media_type == 'movie':
            results = fetcher.search_movie_candidates(query, year)
        else:
            results = fetcher.search_tv_candidates(query)
        
        with open("search_log.txt", "a") as f:
            f.write(f"Found {len(results)} results\n")
            
    except Exception as e:
        with open("search_log.txt", "a") as f:
            f.write(f"Search Error: {e}\n")
            
    return jsonify({'results': results})

@admin_bp.route('/media/<int:media_id>/match', methods=['POST'])
def fix_match(media_id):
    """Fix metadata match"""
    try:
        data = request.json
        tmdb_id = data.get('tmdb_id')
        media_type = data.get('type', 'movie')
        
        if not tmdb_id:
            return jsonify({'error': 'tmdb_id required'}), 400
            
        from metadata import MetadataFetcher
        from database import update_media_metadata
        
        fetcher = MetadataFetcher()
        metadata = None
        
        # SMART MATCHING LOGIC
        # 1. Try requested type
        if media_type == 'movie':
            metadata = fetcher.get_movie_details(tmdb_id)
        else:
            metadata = fetcher.get_tv_details(tmdb_id)
            
        # 2. If not found, TRY THE OTHER TYPE (User might be wrong, or frontend sends default 'movie')
        if not metadata:
            print(f"Match failed for {tmdb_id} as {media_type}. Trying alternate type...")
            if media_type == 'movie':
                metadata = fetcher.get_tv_details(tmdb_id)
            else:
                metadata = fetcher.get_movie_details(tmdb_id)

            
        if metadata:
            # Cache images
            metadata = fetcher.cache_images(metadata)
            # CRITICAL: Lock this item to prevent scanner overwrite
            metadata['locked'] = 1
            
            # Update DB
            update_media_metadata(media_id, metadata)
            return jsonify({'success': True})
            
        return jsonify({'error': 'Metadata not found'}), 404
    except Exception as e:
        import traceback
        with open("match_error.log", "w") as f:
            f.write(f"Error: {e}\n")
            f.write(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/inspect/<int:media_id>', methods=['GET'])
def inspect_media(media_id):
    try:
        from database import get_media_by_id
        media = get_media_by_id(media_id)
        if not media:
            return jsonify({'error': 'Media not found'}), 404
            
        # Get physical file info if exists
        # Get physical file info if exists
        file_info = {}
        if media.get('file_path') and os.path.exists(media['file_path']):
            stat = os.stat(media['file_path'])
            
            # Human readable size
            size_human = f"{stat.st_size / (1024*1024):.2f} MB"
            if stat.st_size > 1024*1024*1024:
                size_human = f"{stat.st_size / (1024*1024*1024):.2f} GB"
                
            file_info = {
                'exists': True,
                'size_bytes': stat.st_size,
                'size_human': size_human,
                'created': datetime.fromtimestamp(stat.st_ctime).isoformat(),
                'modified': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                'permissions': oct(stat.st_mode)[-3:],
                'abs_path': os.path.abspath(media['file_path'])
            }
        else:
            file_info = {
                'exists': False, 
                'path': media.get('file_path'),
                'abs_path': media.get('file_path'), 
                'size_human': 'N/A'
            }
            
        # Image Info
        images = {
            'poster_url': {
                'url': media.get('poster_url'),
                'valid': bool(media.get('poster_url')),
                'local': (media.get('poster_url') or '').startswith('/api/thumbnails')
            },
            'backdrop_url': {
                'url': media.get('backdrop_url'),
                'valid': bool(media.get('backdrop_url')),
                'local': (media.get('backdrop_url') or '').startswith('/api/thumbnails')
            }
        }
        
        # Media Info (FFprobe)
        media_info = {'streams': [], 'format': {}}
        if file_info['exists']:
            try:
                from ffmpeg_utils import get_video_info
                info = get_video_info(file_info['abs_path'])
                if info:
                    media_info = info
            except Exception as e:
                media_info['error'] = str(e)
            
        return jsonify({
            'database': media,
            'filesystem': file_info,
            'images': images,
            'media_info': media_info
        })
    except Exception as e:
        import traceback
        with open("inspect_error.log", "w") as f:
            f.write(f"Error: {e}\n")
            f.write(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/fetch-metadata', methods=['GET'])
def fetch_metadata():
    """Fetch metadata preview"""
    tmdb_id = request.args.get('tmdb_id', type=int)
    media_type = request.args.get('type', 'movie')
    
    if not tmdb_id:
        return jsonify({'error': 'tmdb_id required'}), 400
        
    from metadata import MetadataFetcher
    fetcher = MetadataFetcher()
    
    if media_type == 'movie':
        metadata = fetcher.get_movie_details(tmdb_id)
    else:
        metadata = fetcher.get_tv_details(tmdb_id)
        
    return jsonify(metadata or {})

@admin_bp.route('/fix-all-metadata', methods=['POST'])
def fix_all_metadata():
    """Trigger background job to fix ALL incomplete media — comprehensive repair"""
    
    def background_fix():
        try:
            from metadata import MetadataFetcher
            from database import update_media_metadata, get_all_media
            import time
            
            fetcher = MetadataFetcher()
            all_media = get_all_media({}, 'title', 10000, 0)
            
            log_file = os.path.join(os.path.dirname(__file__), 'logs', 'repair.log')
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            
            def log_repair(msg):
                print(msg)
                try:
                    with open(log_file, 'a', encoding='utf-8') as f:
                        f.write(f"{datetime.now().isoformat()} - {msg}\n")
                except:
                    pass
            
            # Step 0: Purge duplicates first
            log_repair("=== Step 0: Purging Duplicates ===")
            try:
                from purge_duplicates import purge_duplicates
                purge_result = purge_duplicates()
                log_repair(f"Purged {len(purge_result.get('deleted', []))} duplicates")
            except Exception as e:
                log_repair(f"Purge skipped: {e}")
            
            log_repair(f"=== Step 1: Starting comprehensive metadata repair for {len(all_media)} items ===")
            
            # Fields we consider "required" — if ANY is missing, we re-fetch
            REQUIRED_FIELDS = ['overview', 'genres', 'country', 'runtime', 'poster_url', 
                              'backdrop_url', 'tmdb_rating', 'tmdb_id', 'status', 'logo_url']
            
            count = 0
            skipped = 0
            failed = 0
            
            for idx, item in enumerate(all_media):
                # Skip locked items (manually edited by user)
                if item.get('locked'):
                    skipped += 1
                    continue
                
                # Skip episodes (they get data from their parent series)
                if item.get('series_id'):
                    continue
                
                # Check what's missing
                missing = []
                for field in REQUIRED_FIELDS:
                    val = item.get(field)
                    if not val or (isinstance(val, (int, float)) and val == 0):
                        missing.append(field)
                
                # Skip if nothing is missing
                if not missing:
                    continue
                
                log_repair(f"[{idx+1}/{len(all_media)}] Repairing: '{item.get('title')}' (ID:{item['id']}) — Missing: {', '.join(missing)}")
                
                metadata = None
                tmdb_id = item.get('tmdb_id')
                
                # Strategy 1: Fetch by TMDB ID (fastest & most reliable)
                if tmdb_id:
                    try:
                        if item['type'] == 'movie':
                            metadata = fetcher.get_movie_details(tmdb_id)
                        elif item['type'] == 'series':
                            metadata = fetcher.get_tv_details(tmdb_id)
                    except Exception as e:
                        log_repair(f"  TMDB ID fetch failed: {e}")
                
                # Strategy 2: Search by title
                if not metadata:
                    clean_title = item.get('title', '')
                    if clean_title:
                        try:
                            if item['type'] == 'movie':
                                metadata = fetcher.search_movie(clean_title)
                            elif item['type'] == 'series':
                                metadata = fetcher.search_tv(clean_title)
                        except Exception as e:
                            log_repair(f"  Title search failed: {e}")
                
                # Strategy 3: Search by folder/file name
                if not metadata and item.get('folder_path'):
                    folder_name = os.path.basename(item['folder_path'])
                    try:
                        from scanner import MediaScanner
                        scanner = MediaScanner()
                        clean_folder = scanner._clean_filename(folder_name)
                        if clean_folder and clean_folder != clean_title:
                            if item['type'] == 'movie':
                                metadata = fetcher.search_movie(clean_folder)
                            elif item['type'] == 'series':
                                metadata = fetcher.search_tv(clean_folder)
                    except Exception as e:
                        log_repair(f"  Folder search failed: {e}")
                
                if metadata:
                    # Cache images (download posters/backdrops locally)
                    try:
                        metadata = fetcher.cache_images(metadata)
                    except Exception as e:
                        log_repair(f"  Image caching failed: {e}")
                    
                    # Build update dict — only fill in what's missing
                    update_data = {}
                    fill_fields = ['title', 'overview', 'genres', 'country', 'runtime', 
                                   'poster_url', 'backdrop_url', 'tmdb_rating', 'tmdb_id',
                                   'status', 'logo_url', 'year', 'total_seasons', 
                                   'total_episodes', 'trailer_url', 'original_title']
                    
                    for field in fill_fields:
                        new_val = metadata.get(field)
                        old_val = item.get(field)
                        
                        # Fill if old value is missing/empty/zero
                        if new_val and (not old_val or (isinstance(old_val, (int, float)) and old_val == 0)):
                            update_data[field] = new_val
                    
                    if update_data:
                        update_media_metadata(item['id'], update_data)
                        log_repair(f"  ✓ Updated {len(update_data)} fields: {list(update_data.keys())}")
                        count += 1
                    else:
                        log_repair(f"  No new data to fill (metadata was identical)")
                else:
                    log_repair(f"  ✗ No metadata found for '{item.get('title')}'")
                    failed += 1
                
                # REPAIR QUALITY (if still missing, use FFprobe)
                if not item.get('quality') or item.get('quality') == 'Unknown':
                    if item.get('file_path') and os.path.exists(item['file_path']):
                        try:
                            from scanner import MediaScanner
                            scanner = MediaScanner()
                            filename = os.path.basename(item['file_path'])
                            quality = scanner._detect_quality(filename)
                            if quality == 'Unknown' or not quality:
                                quality = scanner.probe_quality(item['file_path'])
                            if quality and quality != 'Unknown':
                                update_media_metadata(item['id'], {'quality': quality})
                                log_repair(f"  Quality detected: {quality}")
                        except Exception as e:
                            log_repair(f"  Quality detection failed: {e}")
                
                # Rate limit (avoid hammering TMDB)
                time.sleep(0.3)
            
            log_repair(f"=== Repair Complete ===")
            log_repair(f"Fixed: {count} | Skipped (locked): {skipped} | Failed: {failed} | Total: {len(all_media)}")
            
        except Exception as e:
            import traceback
            try:
                with open(log_file, 'a', encoding='utf-8') as f:
                    f.write(f"{datetime.now().isoformat()} - FATAL ERROR: {e}\n")
                    f.write(traceback.format_exc() + "\n")
            except:
                pass
            print(f"Fix-all-metadata FATAL: {e}")

    thread = threading.Thread(target=background_fix)
    thread.start()
    
    return jsonify({'success': True, 'message': 'Comprehensive background repair started — check logs/repair.log'})

@admin_bp.route('/diagnose/<int:media_id>', methods=['GET'])
def diagnose_media(media_id):
    """Diagnose why a specific media item is failing repair"""
    from database import get_media_by_id, update_media_metadata
    from metadata import MetadataFetcher
    import traceback
    
    log = []
    def logger(msg):
        log.append(f"{datetime.now().time()} - {msg}")
        
    try:
        item = get_media_by_id(media_id)
        if not item:
            return jsonify({'error': 'Media not found', 'log': log}), 404
            
        logger(f"Diagnosing ID: {media_id} | Title: {item.get('title')} | Type: {item.get('type')}")
        logger(f"Current TMDB ID: {item.get('tmdb_id')} | Runtime: {item.get('runtime')} | Country: {item.get('country')}")
        
        fetcher = MetadataFetcher()
        metadata = None
        
        # 1. Check TMDB ID Fetch
        if item.get('tmdb_id'):
            logger(f"Attempting fetch by TMDB ID: {item.get('tmdb_id')}")
            if item['type'] == 'series':
                metadata = fetcher.get_tv_details(item['tmdb_id']) # V3
            else:
                metadata = fetcher.get_movie_details(item['tmdb_id']) # V3
                
            if metadata:
                logger(f"Fetch by ID SUCCESS. Runtime: {metadata.get('runtime')}")
            else:
                logger("Fetch by ID FAILED (returned None)")
        
        # 2. Check Search
        if not metadata:
            logger(f"Attempting Search for: '{item.get('title')}'")
            if item['type'] == 'series':
                metadata = fetcher.search_tv(item['title'])
            else:
                metadata = fetcher.search_movie(item['title'])
                
            if metadata:
                 logger(f"Search SUCCESS. Found: {metadata.get('title')} (ID: {metadata.get('tmdb_id')})")
                 logger(f"Extracted Runtime: {metadata.get('runtime')}")
            else:
                 logger("Search FAILED (returned None)")
                 
        return jsonify({
            'status': 'Complete',
            'media': dict(item),
            'fetched_metadata': metadata,
            'log': log
        })
        
    except Exception as e:
        log.append(f"Exception: {str(e)}")
        log.append(traceback.format_exc())
        return jsonify({'error': str(e), 'log': log}), 500

@admin_bp.route('/media/<int:media_id>/intro/detect', methods=['POST'])
def detect_intro(media_id):
    """Auto-detect intro for media item"""
    from database import get_media_by_id, update_media_metadata
    from intro_detector import IntroDetector
    import os
    
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
        
    path = media.get('file_path')
    if not path or not os.path.exists(path):
        return jsonify({'error': 'File not found on disk'}), 404
        
    detector = IntroDetector()
    candidates = detector.detect_candidates(path)
    
    guess = detector.guess_intro(candidates)
    
    return jsonify({
        'candidates': candidates,
        'guess': guess
    })

@admin_bp.route('/media/<int:media_id>/intro', methods=['POST'])
def set_intro(media_id):
    """Set intro timestamps manually"""
    from database import update_media_metadata
    
    data = request.json
    start = data.get('start')
    end = data.get('end')
    
    # Validation
    if start is not None and end is not None:
        if float(start) >= float(end):
            return jsonify({'error': 'Start time must be before end time'}), 400
            
    update_media_metadata(media_id, {
        'intro_start': start,
        'intro_end': end
    })
    
    return jsonify({'success': True, 'start': start, 'end': end})


@admin_bp.route('/media/<int:media_id>/outro', methods=['POST'])
def set_outro(media_id):
    """Set outro/credits timestamps manually"""
    from database import update_media_metadata
    
    data = request.json
    start = data.get('start')
    end = data.get('end')
    
    # Validation
    if start is not None and end is not None:
        if float(start) >= float(end):
            return jsonify({'error': 'Start time must be before end time'}), 400
            
    update_media_metadata(media_id, {
        'outro_start': start,
        'outro_end': end
    })
    
    return jsonify({'success': True, 'start': start, 'end': end})
