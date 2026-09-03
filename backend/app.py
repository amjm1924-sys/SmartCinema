# CinemaStream - Main Flask Application
# Media streaming server with REST API
# Reload Trigger: 1

import os
import re
import sys
import json
import mimetypes
import threading
import platform
from pathlib import Path
from flask import Flask, request, jsonify, send_file, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from scan_status import scan_status as scan_manager

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from database import (
    init_db, add_media, get_media_by_id, get_media_by_path, get_all_media,
    get_series_episodes, update_media_metadata, update_watch_progress,
    get_continue_watching, get_recently_watched, get_watch_position,
    add_library_path, get_library_paths, remove_library_path, update_scan_time,
    get_setting, set_setting, get_library_stats, delete_media, hide_path,
    get_media_by_tmdb_id, DB_PATH, remove_from_watch_history, toggle_library_path_lock,  # Add DB_PATH for admin panel
    get_connection
)
from favorites import (
    add_to_favorites, remove_from_favorites, is_favorite,
    get_all_favorites
)
from profiles import resolve_profile, get_all_profiles, get_profile_by_id, create_profile, update_profile, delete_profile, assign_ip, remove_ip
from ai_recs import get_recommendations as get_ai_recommendations
from scanner import MediaScanner, scan_library_path
from metadata import MetadataFetcher, fetch_metadata_for_media

from thumbnails import register_thumbnail_routes
from subtitles import register_subtitle_routes
from ffmpeg_utils import get_ffmpeg_manager

from admin import admin_bp
from collections_api import collections_bp
from playlists import playlists_bp
from downloads import downloads_bp
from iptv import iptv_bp
from opensubtitles import opensubtitles_bp
from hls_transcoder import hls_bp
from analytics import analytics_bp, init_analytics_tables
from trailers import trailers_bp
from cast_api import cast_bp
from toolbox_api import toolbox_bp

from werkzeug.middleware.proxy_fix import ProxyFix

# =============================================================================
# Simple TTL Cache for API responses — تخزين مؤقت للردود المتكررة
# =============================================================================
import time as _time
from collections import OrderedDict

_CACHE_MAX_SIZE = 500  # Maximum cache entries
_cache = OrderedDict()
_cache_timestamps = {}

def cached_response(key, ttl_seconds=30):
    """Return cached value if still valid, else None"""
    now = _time.time()
    if key in _cache and (now - _cache_timestamps.get(key, 0)) < ttl_seconds:
        # Move to end (most recently used)
        _cache.move_to_end(key)
        return _cache[key]
    # Expired or missing — clean up
    _cache.pop(key, None)
    _cache_timestamps.pop(key, None)
    return None

def set_cache(key, value, ttl_seconds=30):
    """Store value in cache with timestamp, evicting oldest if full"""
    # Evict oldest entries if cache is full
    while len(_cache) >= _CACHE_MAX_SIZE:
        oldest_key, _ = _cache.popitem(last=False)
        _cache_timestamps.pop(oldest_key, None)
    _cache[key] = value
    _cache_timestamps[key] = _time.time()

def invalidate_cache(prefix=None):
    """Clear cache entries. If prefix given, only clear matching keys."""
    if prefix:
        keys_to_remove = [k for k in _cache if k.startswith(prefix)]
        for k in keys_to_remove:
            _cache.pop(k, None)
            _cache_timestamps.pop(k, None)
    else:
        _cache.clear()
        _cache_timestamps.clear()

# Initialize Flask app
app = Flask(__name__, static_folder='../frontend/dist', static_url_path='')
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_host=1)
CORS(app, origins="*", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], allow_headers="*", supports_credentials=False)  # Enable CORS for all routes - LAN access

# Force DB Init on startup (Fixes 'flask run' skipping main block)
# Now critical since we removed auto-init from database.py
try:
    print("Initializing database...")
    init_db()
    init_analytics_tables()  # Initialize analytics tables
    print("Database initialized successfully.")
except Exception as e:
    print(f"Error initializing database: {e}")

# Configure Logging
from session_logger import session_logger
session_logger.log_backend('INFO', '================ SmartCinema Session Started ================')

@app.before_request
def _log_request_start():
    import time
    request._start_time = time.time()

@app.after_request
def _log_request_end(response):
    import time
    if hasattr(request, '_start_time') and not request.path.startswith('/api/logs'):
        duration_ms = (time.time() - request._start_time) * 1000
        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        session_logger.log_request(request.method, request.path, response.status_code, duration_ms, client_ip)
    return response

@app.errorhandler(Exception)
def _handle_exception(e):
    # Let Werkzeug HTTP exceptions pass through with their proper status codes
    # (e.g. 416 Range Not Satisfiable, 404 Not Found, 400 Bad Request)
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return e
    session_logger.log_backend('ERROR', f"Unhandled exception on {request.method} {request.path}: {e}", exc=e)
    return jsonify({'error': 'Internal Server Error', 'details': str(e)}), 500

# Redirect stdout/stderr to logging
class StreamToLogger(object):
    def __init__(self, logger, level):
        self.logger = logger
        self.level = level
        self.linebuf = ''

    def write(self, buf):
        for line in buf.rstrip().splitlines():
            self.logger.log(self.level, line.rstrip())

    def flush(self):
        pass

# Only redirect if not already redirected
if sys.stdout != sys.__stdout__ and False: # DISABLED FOR DEBUGGING
    sys.stdout = StreamToLogger(logging.getLogger('STDOUT'), logging.INFO)
    sys.stderr = StreamToLogger(logging.getLogger('STDERR'), logging.ERROR)

# Register additional routes

register_thumbnail_routes(app)
register_subtitle_routes(app)

# Register Blueprints
app.register_blueprint(admin_bp)
app.register_blueprint(collections_bp)
app.register_blueprint(playlists_bp)
app.register_blueprint(downloads_bp)
app.register_blueprint(iptv_bp)
app.register_blueprint(opensubtitles_bp)
app.register_blueprint(hls_bp)
app.register_blueprint(analytics_bp)
app.register_blueprint(trailers_bp)
app.register_blueprint(cast_bp)
app.register_blueprint(toolbox_bp, url_prefix='/api/toolbox')

from ai_api import ai_bp
app.register_blueprint(ai_bp, url_prefix='/api/ai')

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # Disable caching for development

from werkzeug.local import LocalProxy

# Global scanner/fetcher instances (Lazy Initialization to prevent Fork Bomb)
_scanner = None
_fetcher = None

def get_scanner():
    global _scanner
    if _scanner is None:
        _scanner = MediaScanner()
    return _scanner

def get_fetcher():
    global _fetcher
    if _fetcher is None:
        _fetcher = MetadataFetcher()
    return _fetcher

scanner = LocalProxy(get_scanner)
fetcher = LocalProxy(get_fetcher)

# Legacy scan_status dict removed (replaced by scan_manager)

# =============================================================================
# Static File Serving
# =============================================================================

@app.route('/')
def serve_index():
    """Serve the main HTML page"""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files"""
    return send_from_directory(app.static_folder, path)

# =============================================================================
# Security Middleware
# =============================================================================

# Simple Admin Key (Load from env or default to 'smartcinema_admin')
ADMIN_KEY = os.environ.get('ADMIN_KEY', 'smartcinema_admin')

@app.before_request
def check_admin_auth():
    """Protect admin routes with API Key"""
    if request.path.startswith('/api/admin') and request.method != 'OPTIONS':
        # Check Header or Query Param
        key = request.headers.get('X-Admin-Key') or request.args.get('key')
        
        # Allow localhost and LAN IPs without key
        ip = request.remote_addr
        is_local = ip in ('127.0.0.1', '::1') or ip.startswith('192.168.') or ip.startswith('10.') or (ip.startswith('172.') and 16 <= int(ip.split('.')[1]) <= 31)
        
        if not is_local and key != ADMIN_KEY:
             return jsonify({'error': 'Unauthorized', 'message': 'Invalid or missing Admin Key'}), 401

def is_safe_path(path):
    """Ensure path is within allowed library directories"""
    # Get allowed paths from DB (cached)
    from database import get_library_paths
    try:
        allowed_prefixes = [os.path.abspath(p['path']) for p in get_library_paths()]
        # Also allow data/trailers
        data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'data'))
        allowed_prefixes.append(data_dir)
        
        target = os.path.abspath(path)
        return any(target.startswith(prefix) for prefix in allowed_prefixes)
    except Exception:
        # Fail closed: if DB is unavailable, deny access
        return '..' not in path and not path.startswith('\\\\')

# =============================================================================
# Cached Images API
# =============================================================================

@app.route('/api/images/<path:filename>')
def serve_cached_image(filename):
    """Serve cached poster/backdrop images with long-term caching"""
    images_dir = Path(__file__).parent.parent / 'data' / 'images'
    response = send_from_directory(images_dir, filename)
    # Cache for 1 year (immutable)
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return response

# =============================================================================
# Media Library API
# =============================================================================

@app.route('/api/media', methods=['GET'])
def get_media():
    """Get all media with optional filters"""
    filters = {}
    
    # Type filter (movie/series)
    if request.args.get('type'):
        filters['type'] = request.args.get('type')
    
    # Genre filter
    if request.args.get('genre'):
        filters['genre'] = request.args.get('genre')
    
    # Year filter (exact year)
    if request.args.get('year'):
        filters['year'] = request.args.get('year')
    
    # Year range filters
    try:
        if request.args.get('year_from'):
            filters['year_from'] = int(request.args.get('year_from'))
        if request.args.get('year_to'):
            filters['year_to'] = int(request.args.get('year_to'))
    except ValueError:
        return jsonify({'error': 'Invalid year format. Must be an integer.'}), 400
    
    # Search filter
    if request.args.get('search'):
        filters['search'] = request.args.get('search')
    
    # Certification filter (age rating)
    if request.args.get('certification'):
        filters['certification'] = request.args.get('certification')
    
    # Sorting
    sort_by = request.args.get('sort', 'title')
    
    # Pagination
    try:
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))
    except ValueError:
        return jsonify({'error': 'Invalid pagination parameters. Must be integers.'}), 400
    
    # Cache check — مفتاح التخزين المؤقت يعتمد على معاملات الطلب
    cache_key = f"media:{request.query_string.decode()}"
    hit = cached_response(cache_key, ttl_seconds=30)
    if hit is not None:
        return jsonify(hit)
    
    from database import get_media_count
    
    media = get_all_media(filters, sort_by, limit, offset)
    total = get_media_count(filters)
    
    result = {
        'data': media,
        'page': (offset // limit) + 1 if limit > 0 else 1,
        'total': total,
        'limit': limit
    }
    set_cache(cache_key, result, ttl_seconds=30)
    return jsonify(result)

@app.route('/api/media/featured', methods=['GET'])
def get_featured_media():
    """Get featured media (random for now) — cached for 5 minutes"""
    cache_key = "media:featured"
    hit = cached_response(cache_key, ttl_seconds=300)
    if hit is not None:
        return jsonify(hit)
    media = get_all_media({}, 'random', 5, 0)
    set_cache(cache_key, media, ttl_seconds=300)
    return jsonify(media)

@app.route('/api/media/<int:media_id>/logos', methods=['GET'])
def get_media_logos(media_id):
    """Fetch transparent logo images for a media item from TMDB"""
    import urllib.request
    import urllib.parse
    import json as _json

    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'logos': []}), 200
    
    tmdb_id = media.get('tmdb_id')
    media_type = media.get('type', 'movie')
    if not tmdb_id:
        return jsonify({'logos': []}), 200
    
    try:
        from metadata import TMDB_API_KEY, TMDB_IMAGE_BASE
        tmdb_type = 'tv' if media_type == 'series' else 'movie'
        params = urllib.parse.urlencode({'api_key': TMDB_API_KEY})
        url = f"https://api.themoviedb.org/3/{tmdb_type}/{tmdb_id}/images?{params}"

        req_obj = urllib.request.Request(url, headers={'Accept': 'application/json'})
        with urllib.request.urlopen(req_obj, timeout=10) as resp:
            data = _json.loads(resp.read().decode('utf-8'))
        
        logos = data.get('logos', [])
        
        # Prefer English logos, then no language, then any; sort by vote_average desc
        logos.sort(key=lambda x: (
            0 if x.get('iso_639_1') == 'en' else
            1 if not x.get('iso_639_1') else 2,
            -x.get('vote_average', 0)
        ))
        
        result = [
            {
                'url': f"{TMDB_IMAGE_BASE}/original{logo['file_path']}",
                'language': logo.get('iso_639_1'),
                'width': logo.get('width'),
                'height': logo.get('height'),
                'vote_average': logo.get('vote_average', 0)
            }
            for logo in logos[:5]
        ]
        
        return jsonify({'logos': result})
    except Exception as e:
        session_logger.log_backend('WARN', f"Could not fetch logos for media {media_id}: {e}")
        return jsonify({'logos': []}), 200

@app.route('/api/ollama/status', methods=['GET'])
def ollama_status():
    """Check Ollama status, version, and running models"""
    import urllib.request, json as _json
    try:
        # Check if Ollama is alive
        req = urllib.request.Request('http://localhost:11434/api/version', headers={'Accept': 'application/json'})
        with urllib.request.urlopen(req, timeout=3) as r:
            version_data = _json.loads(r.read().decode())

        # List installed models
        req2 = urllib.request.Request('http://localhost:11434/api/tags', headers={'Accept': 'application/json'})
        with urllib.request.urlopen(req2, timeout=3) as r2:
            tags_data = _json.loads(r2.read().decode())

        # List running (loaded) models
        running = []
        try:
            req3 = urllib.request.Request('http://localhost:11434/api/ps', headers={'Accept': 'application/json'})
            with urllib.request.urlopen(req3, timeout=3) as r3:
                ps_data = _json.loads(r3.read().decode())
                running = ps_data.get('models', [])
        except Exception:
            pass

        from ai_service import ai_service
        return jsonify({
            'running': True,
            'version': version_data.get('version', 'unknown'),
            'models': tags_data.get('models', []),
            'running_models': running,
            'active_model': ai_service.OLLAMA_MODEL,
        })
    except Exception as e:
        return jsonify({
            'running': False,
            'error': str(e),
            'models': [],
            'running_models': [],
            'active_model': None,
        })

@app.route('/api/ollama/set-model', methods=['POST'])
def ollama_set_model():
    """Change the active Ollama model used by AIService"""
    body = request.get_json(silent=True) or {}
    model = body.get('model', '').strip()
    if not model:
        return jsonify({'error': 'model name required'}), 400
    try:
        from ai_service import ai_service
        ai_service.OLLAMA_MODEL = model
        return jsonify({'success': True, 'active_model': model})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ollama/pull', methods=['POST'])
def ollama_pull():
    """Pull (download) a new Ollama model in the background"""
    import threading, urllib.request, json as _json
    body = request.get_json(silent=True) or {}
    model = body.get('model', '').strip()
    if not model:
        return jsonify({'error': 'model name required'}), 400

    def _pull():
        try:
            payload = _json.dumps({'name': model, 'stream': False}).encode()
            req = urllib.request.Request(
                'http://localhost:11434/api/pull',
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=600) as r:
                r.read()
            logger.info(f"Ollama: pull of '{model}' completed")
        except Exception as e:
            logger.error(f"Ollama pull error for '{model}': {e}")

    threading.Thread(target=_pull, daemon=True).start()
    return jsonify({'success': True, 'message': f"Pulling '{model}' in background…"})

@app.route('/api/admin/gpu-status', methods=['GET'])
def get_gpu_status():
    from transcode_utils import get_video_codec
    from ffmpeg_utils import get_ffmpeg_manager
    codec = get_video_codec()
    mgr = get_ffmpeg_manager()
    return jsonify({
        'codec': codec,
        'hardware_accelerated': codec != 'libx264',
        'encoder_name': {
            'hevc_nvenc': 'NVIDIA NVENC (HEVC/H.265)',
            'h264_nvenc': 'NVIDIA NVENC (H.264)',
            'h264_qsv': 'Intel QuickSync (H.264)',
            'h264_amf': 'AMD AMF (H.264)',
            'libx264': 'CPU Software Encoding (libx264)'
        }.get(codec, codec),
        'ffmpeg_available': mgr.is_available(),
        'ffmpeg_path': mgr.get_ffmpeg_path()
    })

@app.route('/api/ollama/delete', methods=['POST'])
def ollama_delete():
    """Delete an Ollama model"""
    import urllib.request, json as _json
    body = request.get_json(silent=True) or {}
    model = body.get('model', '').strip()
    if not model:
        return jsonify({'error': 'model name required'}), 400
    try:
        payload = _json.dumps({'name': model}).encode()
        req = urllib.request.Request(
            'http://localhost:11434/api/delete',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='DELETE'
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def ai_chat():
    """Multi-turn AI chat with TMDB RAG and media card responses"""
    try:
        from ai_service import ai_service
        body = request.get_json(silent=True) or {}
        message = body.get('message', '').strip()
        history = body.get('history', [])

        if not message:
            return jsonify({'error': 'No message provided'}), 400

        result = ai_service.chat(message, history)
        return jsonify(result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'text': f'Sorry, the AI is unavailable: {str(e)}', 'media_cards': []}), 500

@app.route('/api/ai_search', methods=['GET'])
def ai_search():
    """Perform natural language search using AI"""
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'error': 'No search query provided'}), 400
        
    try:
        from ai_service import ai_service
        parsed_params = ai_service.parse_search_query(query)
        
        # Map AI JSON to database filters
        filters = {}
        if parsed_params.get('genre'): filters['genre'] = parsed_params['genre']
        if parsed_params.get('year'): filters['year'] = parsed_params['year']
        if parsed_params.get('year_from'): filters['year_from'] = parsed_params['year_from']
        if parsed_params.get('year_to'): filters['year_to'] = parsed_params['year_to']
        if parsed_params.get('type'): filters['type'] = parsed_params['type']
        if parsed_params.get('search'): filters['search'] = parsed_params['search']
        
        limit = int(request.args.get('limit', 50))
        media = get_all_media(filters, 'tmdb_rating', limit, 0)
        
        return jsonify({
            'data': media,
            'parsed_params': parsed_params
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def get_request_profile() -> int:
    """Get the profile_id for the current request based on header or client IP."""
    header_profile = request.headers.get('X-Profile-ID')
    if header_profile and header_profile.isdigit():
        return int(header_profile)
    ip = request.remote_addr or '127.0.0.1'
    return resolve_profile(ip)

@app.route('/api/media/<int:media_id>', methods=['GET'])
def get_single_media(media_id):
    """Get a single media item by ID"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    profile_id = get_request_profile()
    
    # If it's a series, include episodes and fetch TMDB details for missing episodes/status
    if media['type'] == 'series':
        media['episodes'] = get_series_episodes(media_id, profile_id=profile_id)
        
        # Fetch TMDB Details (Status, Full Seasons structure)
        if media.get('tmdb_id'):
            try:
                from metadata import MetadataFetcher
                fetcher = MetadataFetcher()
                # Use Arabic request first to get localized data if we can, fallback is ok
                tmdb_data = fetcher._make_request(f"/tv/{media['tmdb_id']}", {'language': 'ar-SA'})
                if not tmdb_data or 'status' not in tmdb_data:
                    # Fallback to English
                    tmdb_data = fetcher._make_request(f"/tv/{media['tmdb_id']}", {'language': 'en-US'})
                
                if tmdb_data:
                    media['tmdb_status'] = tmdb_data.get('status')
                    media['tmdb_seasons'] = tmdb_data.get('seasons', [])
            except Exception as e:
                import traceback
                print(f"Error fetching TMDB TV details in API: {e}")
                traceback.print_exc()

    # Include watch position (profile-aware)
    media['watch_position'] = get_watch_position(media_id, profile_id=profile_id)
    
    return jsonify(media)

@app.route('/api/media/<int:media_id>/episodes', methods=['GET'])
def get_episodes(media_id):
    """Get all episodes for a series"""
    profile_id = get_request_profile()
    episodes = get_series_episodes(media_id, profile_id=profile_id)
    return jsonify(episodes)


@app.route('/api/calendar/upcoming', methods=['GET'])
def get_upcoming_calendar():
    """Get upcoming episodes for series in library"""
    cache_key = "calendar:upcoming"
    hit = cached_response(cache_key, ttl_seconds=3600)  # 1 hour cache
    if hit is not None:
        return jsonify(hit)

    from database import get_connection
    from metadata import MetadataFetcher, TMDB_IMAGE_BASE
    
    fetcher = MetadataFetcher()
    upcoming = []
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, tmdb_id, poster_url FROM media WHERE type = 'series' AND tmdb_id IS NOT NULL")
        series_list = cursor.fetchall()
        
        for series in series_list:
            try:
                tmdb_data = fetcher._make_request(f"/tv/{series['tmdb_id']}", {'language': 'ar-SA'})
                if not tmdb_data or 'next_episode_to_air' not in tmdb_data or not tmdb_data['next_episode_to_air']:
                    continue
                
                next_ep = tmdb_data['next_episode_to_air']
                
                upcoming.append({
                    'series_title': series['title'],
                    'poster_url': series['poster_url'],
                    'season_number': next_ep.get('season_number'),
                    'episode_number': next_ep.get('episode_number'),
                    'episode_name': next_ep.get('name'),
                    'air_date': next_ep.get('air_date')
                })
            except Exception as e:
                print(f"Error fetching next episode for {series['title']}: {e}")
                continue
                
    # Sort by air date
    upcoming.sort(key=lambda x: x['air_date'] if x['air_date'] else '9999-12-31')
    
    set_cache(cache_key, upcoming, ttl_seconds=3600)
    return jsonify(upcoming)


@app.route('/api/series/<int:series_id>/seasons/<int:season_num>/intro', methods=['POST'])
def detect_intro(series_id, season_num):
    """Detect intro for a season"""
    from intro_detector import intro_detector
    
    # Run in background? Or blocking?
    # It takes ~30-60s per season. Blocking might timeout.
    # Start thread.
    
    def run_detection():
        try:
            print(f"Starting intro detection for Series {series_id} Season {season_num}")
            per_episode = intro_detector.detect_intro_for_season(series_id, season_num)
            
            if per_episode:
                print(f"Intros detected for {len(per_episode)} episodes: {per_episode}")
                # Save to DB for the detected episodes
                with get_connection() as conn:
                    cursor = conn.cursor()
                    for ep_id, (start, end) in per_episode.items():
                        cursor.execute("""
                            UPDATE media 
                            SET intro_start = ?, intro_end = ?
                            WHERE id = ?
                        """, (start, end, ep_id))
                    conn.commit()
            else:
                print("No intro detected.")
                
        except Exception as e:
            print(f"Intro detection failed: {e}")

    thread = threading.Thread(target=run_detection)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'success': True, 
        'processing': True,
        'message': 'Intro detection started in background'
    })

# =============================================================================
# Watch History API
# =============================================================================

@app.route('/api/history/continue', methods=['GET'])
def api_continue_watching():
    """Get continue watching list (profile-aware)"""
    limit = int(request.args.get('limit', 10))
    profile_id = get_request_profile()
    media = get_continue_watching(limit, profile_id=profile_id)
    return jsonify(media)

@app.route('/api/history/recent', methods=['GET'])
def api_recently_watched():
    """Get recently watched list (profile-aware)"""
    limit = int(request.args.get('limit', 10))
    profile_id = get_request_profile()
    media = get_recently_watched(limit, profile_id=profile_id)
    return jsonify(media)

@app.route('/api/history/update', methods=['POST'])
def api_update_progress():
    """Update watch progress (profile-aware)"""
    data = request.get_json(silent=True) or {}
    media_id = data.get('media_id')
    position = data.get('position', 0)
    duration = data.get('duration', 0)
    
    if not media_id:
        return jsonify({'error': 'media_id required'}), 400
    
    profile_id = get_request_profile()
    update_watch_progress(media_id, position, duration, profile_id=profile_id)
    return jsonify({'success': True})

@app.route('/api/history/<int:media_id>', methods=['DELETE'])
def remove_from_history(media_id):
    """Remove item from watch history (profile-aware)"""
    profile_id = get_request_profile()
    remove_from_watch_history(media_id, profile_id=profile_id)
    return jsonify({'success': True})

# =============================================================================
# Library Management API
# =============================================================================

@app.route('/api/library/paths', methods=['GET'])
def api_get_paths():
    """Get all library paths"""
    paths = get_library_paths()
    return jsonify(paths)

@app.route('/api/library/paths', methods=['POST'])
def api_add_path():
    """Add a new library path"""
    data = request.get_json(silent=True) or {}
    path = data.get('path', '').strip()
    
    if not path:
        return jsonify({'error': 'Path is required'}), 400
    
    if not os.path.exists(path):
        return jsonify({'error': 'Path does not exist'}), 400
    
    path_id = add_library_path(path)
    return jsonify({'success': True, 'id': path_id})

@app.route('/api/library/paths/<int:path_id>', methods=['DELETE'])
def api_remove_path(path_id):
    """Remove a library path"""
    remove_library_path(path_id)
    return jsonify({'success': True})

@app.route('/api/library/scan', methods=['POST'])
def api_start_scan():
    """Start scanning library paths"""
    
    if scan_manager.get_snapshot()['is_scanning']:
        return jsonify({'error': 'Scan already in progress'}), 400
    
    # Get paths to scan (ONLY ENABLED)
    paths = get_library_paths(only_enabled=True)
    if not paths:
        return jsonify({'error': 'No active library paths configured'}), 400
    
    # Start scan in background thread
    thread = threading.Thread(target=_background_scan, args=(paths,))
    thread.daemon = True
    thread.start()
    
    return jsonify({'success': True, 'message': 'Scan started'})

@app.route('/api/library/scan/series/<int:series_id>', methods=['POST'])
def api_scan_series(series_id):
    """Scan a specific series folder for new/updated episodes"""
    if scan_manager.get_snapshot()['is_scanning']:
        return jsonify({'error': 'Scan already in progress'}), 400
        
    series = get_media_by_id(series_id)
    if not series or series.get('type') != 'series':
        return jsonify({'error': 'Series not found'}), 404
        
    folder_path = series.get('folder_path') or series.get('file_path')
    if not folder_path or not os.path.exists(folder_path):
        return jsonify({'error': 'Series folder not found on disk'}), 404
        
    # FIX: If the stored folder_path is a Season folder, use the parent and update DB
    import re
    folder_name = os.path.basename(folder_path)
    if re.search(r'^(season|موسم)\s*\d+$', folder_name, re.IGNORECASE) or folder_name.lower() in ['specials', 'bonus']:
        parent_path = os.path.dirname(folder_path)
        if os.path.exists(parent_path):
            folder_path = parent_path
            try:
                from database import get_connection
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("UPDATE media SET folder_path = ? WHERE id = ?", (folder_path, series_id))
                    conn.commit()
            except Exception as e:
                print(f"Error correcting series folder_path: {e}")
                
    # Start scan in background thread
    thread = threading.Thread(target=_background_series_scan, args=(folder_path,))
    thread.daemon = True
    thread.start()
    
    return jsonify({'success': True, 'message': 'Series scan started'})

@app.route('/api/library/paths/<int:path_id>/toggle', methods=['POST'])
def api_toggle_path(path_id):
    """Toggle lock status of a library path"""
    new_status = toggle_library_path_lock(path_id)
    return jsonify({'success': True, 'enabled': new_status})

@app.route('/api/library/scan/status', methods=['GET'])
def api_scan_status():
    """Get current scan status"""
    return jsonify(scan_manager.get_snapshot())

@app.route('/api/settings/auto_scan', methods=['GET'])
def api_get_auto_scan():
    """Get the auto-scan enabled setting"""
    is_enabled = get_setting('auto_scan', 'true') == 'true'
    return jsonify({'auto_scan': is_enabled})

@app.route('/api/settings/auto_scan', methods=['POST'])
def api_set_auto_scan():
    """Toggle the auto-scan background task"""
    from auto_scanner import auto_scanner
    data = request.get_json(silent=True) or {}
    enable = data.get('enable', True)
    
    set_setting('auto_scan', 'true' if enable else 'false')
    
    if enable:
        if not auto_scanner.is_running:
            auto_scanner.start(scan_callback=_background_scan)
        return jsonify({'success': True, 'message': 'Auto-scan enabled'})
    else:
        if auto_scanner.is_running:
            auto_scanner.stop()
        return jsonify({'success': True, 'message': 'Auto-scan disabled'})

@app.route('/api/library/scan/events')
def api_scan_events():
    """Server-Sent Events for real-time scan progress"""
    def generate():
        idle_count = 0
        max_idle = 300  # Close connection after 5 minutes of no scanning
        while True:
            snapshot = scan_manager.get_snapshot()
            json_data = json.dumps(snapshot)
            yield f"data: {json_data}\n\n"
            
            if not snapshot['is_scanning']:
                idle_count += 1
                if idle_count > max_idle:
                    # Close SSE connection after prolonged inactivity
                    yield f"data: {json.dumps({'is_scanning': False, 'current_file': 'Connection closed', 'done': True})}\n\n"
                    return
            else:
                idle_count = 0

            scan_manager.wait_for_update(timeout=1.0)
            
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/api/library/stats', methods=['GET'])
def api_library_stats():
    """Get library statistics — cached for 60 seconds"""
    cache_key = "library:stats"
    hit = cached_response(cache_key, ttl_seconds=60)
    if hit is not None:
        return jsonify(hit)
    stats = get_library_stats()
    set_cache(cache_key, stats, ttl_seconds=60)
    return jsonify(stats)

def _background_scan(paths):
    """Background scanning function using centralized logic"""
    try:
        # scan_manager.start_scan() # Now called inside scanner.scan_directory or we call it here for aggregated total
        # Since we have multiple paths, we might want to manage the total here?
        # Actually scanner.scan_directory resets it. 
        # Ideally we iterate paths and update.
        # For strict hierarchy, we just delegate to scanner which uses the manager.
        
        all_media = []
        for path_info in paths:
            path = path_info['path']
            # update_scan_time(path) # Done in database
            
            # The scanner now updates scan_manager internally
            media_files = scanner.scan_directory(path, cleanup=True)
            all_media.extend(media_files)
            
            update_scan_time(path)

        # Process found files (Database Ingestion)
        # Note: scanner.scan_directory returns grouped dicts. We need to save them.
        # The previous logic did this manually. We should keep the ingestion logic but use the manager for status.
        
        # Ingest Found Media (With Orphan Adoption)
        scan_manager.update_progress("Ingesting metadata...", status='processing')
        scanner.ingest_results(all_media)
        
        # FINAL CLEANUP: Remove orphans (unused broken entries)
        scanner.prune_orphans()
                
        # مسح التخزين المؤقت بعد انتهاء الفحص — invalidate all cached data
        invalidate_cache()
        scan_manager.finish_scan()

    except Exception as e:
        print(f"Scan fatal error: {e}")
        scan_manager.log_failure("General Scan", str(e))
        scan_manager.finish_scan()

def _background_series_scan(folder_path):
    """Background scanning function for a single series folder"""
    try:
        media_files = scanner.scan_directory(folder_path, cleanup=True)
        scan_manager.update_progress("Ingesting series metadata...", status='processing')
        scanner.ingest_results(media_files)
        scan_manager.finish_scan()
    except Exception as e:
        print(f"Series scan fatal error: {e}")
        scan_manager.log_failure("Series Scan", str(e))
        scan_manager.finish_scan()

# =============================================================================
# User Rating API  
# =============================================================================

@app.route('/api/media/<int:media_id>/rating', methods=['PUT'])
def set_user_rating(media_id):
    """Set personal user rating for a media item (1-10 scale)"""
    data = request.get_json()
    rating = data.get('rating')
    
    # Validate rating: must be None (to clear) or 1-10
    if rating is not None:
        try:
            rating = float(rating)
            if rating < 1 or rating > 10:
                return jsonify({'error': 'Rating must be between 1 and 10'}), 400
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid rating value'}), 400
    
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE media SET user_rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                      (rating, media_id))
        conn.commit()
    
    return jsonify({'success': True, 'user_rating': rating})

@app.route('/api/media/<int:media_id>/rating', methods=['GET'])
def get_user_rating(media_id):
    """Get personal user rating for a media item"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    return jsonify({'user_rating': media.get('user_rating')})

# =============================================================================
# =============================================================================
# Video Streaming API
# =============================================================================

@app.route('/api/download/<int:media_id>')
def api_download(media_id):
    """Download a media file directly"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    file_path = media.get('file_path')
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
        
    # SECURITY: Path Traversal Check
    if not is_safe_path(file_path):
        return jsonify({'error': 'Access Denied', 'message': 'File path is not in allowed library folders'}), 403
    
    # Send file as attachment
    filename = os.path.basename(file_path)
    return send_file(file_path, as_attachment=True, download_name=filename)

# =============================================================================
# Subtitle Merge API — Merge subtitle file into video container
# =============================================================================

_merge_jobs = {}  # {job_id: {status, progress, file_path, error, title, created_at}}
_MERGE_JOB_TTL = 3600  # Clean up completed jobs after 1 hour

def _cleanup_old_merge_jobs():
    """Remove completed/failed merge jobs older than TTL"""
    now = _time.time()
    expired = [jid for jid, job in _merge_jobs.items()
               if job.get('status') in ('completed', 'failed')
               and now - job.get('created_at', 0) > _MERGE_JOB_TTL]
    for jid in expired:
        _merge_jobs.pop(jid, None)
MERGE_CACHE_DIR = os.path.join(os.getcwd(), 'static', 'merged')
os.makedirs(MERGE_CACHE_DIR, exist_ok=True)

def _background_merge_subtitle(video_path, subtitle_path, output_path, job_id, sub_lang='ara'):
    """Background task: merge subtitle into video using FFmpeg copy mode"""
    import time
    try:
        ffmpeg_mgr = get_ffmpeg_manager()
        ffmpeg_path = ffmpeg_mgr.get_ffmpeg_path()
        if not ffmpeg_path:
            _merge_jobs[job_id]['status'] = 'failed'
            _merge_jobs[job_id]['error'] = 'FFmpeg not found'
            return

        ext = os.path.splitext(output_path)[1].lower()
        
        # Determine subtitle codec based on output container
        if ext == '.mp4':
            sub_codec = 'mov_text'
        elif ext in ('.mkv', '.webm'):
            sub_codec = 'srt'
        else:
            sub_codec = 'mov_text'
        
        cmd = [
            ffmpeg_path, '-y',
            '-i', video_path,
            '-i', subtitle_path,
            '-map', '0:v',       # All video streams from input 0
            '-map', '0:a',       # All audio streams from input 0
            '-map', '1:0',       # First stream from subtitle file
            '-c:v', 'copy',      # Don't re-encode video
            '-c:a', 'copy',      # Don't re-encode audio
            '-c:s', sub_codec,   # Subtitle codec
            f'-metadata:s:s:0', f'language={sub_lang}',
            f'-metadata:s:s:0', 'title=Arabic',
            '-disposition:s:0', 'default',
            output_path
        ]
        
        _merge_jobs[job_id]['status'] = 'processing'
        _merge_jobs[job_id]['progress'] = 10
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        
        # Parse FFmpeg stderr for progress
        _merge_jobs[job_id]['progress'] = 30
        stdout, stderr = process.communicate()
        
        if process.returncode == 0 and os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            if file_size > 1000:  # Sanity check: file should be > 1KB
                _merge_jobs[job_id]['status'] = 'completed'
                _merge_jobs[job_id]['progress'] = 100
                _merge_jobs[job_id]['file_path'] = output_path
                _merge_jobs[job_id]['file_size'] = file_size
                print(f"✅ Subtitle merge completed: {output_path} ({file_size / 1024 / 1024:.1f} MB)")
            else:
                _merge_jobs[job_id]['status'] = 'failed'
                _merge_jobs[job_id]['error'] = 'Output file too small — merge may have failed'
        else:
            stderr_text = stderr.decode('utf-8', errors='replace')[-500:]
            _merge_jobs[job_id]['status'] = 'failed'
            _merge_jobs[job_id]['error'] = f'FFmpeg failed: {stderr_text}'
            print(f"❌ Subtitle merge failed: {stderr_text}")
            # Clean up failed output
            if os.path.exists(output_path):
                os.remove(output_path)
                
    except Exception as e:
        import traceback
        _merge_jobs[job_id]['status'] = 'failed'
        _merge_jobs[job_id]['error'] = str(e)
        print(f"❌ Subtitle merge exception: {traceback.format_exc()}")


@app.route('/api/media/<int:media_id>/merge-subtitle', methods=['POST'])
def api_merge_subtitle(media_id):
    """Merge a subtitle file into the video container"""
    import uuid
    
    media = get_media_by_id(media_id)
    _cleanup_old_merge_jobs()
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    video_path = media.get('file_path')
    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video file not found'}), 404
    
    data = request.get_json() or {}
    subtitle_path = data.get('subtitle_path')
    subtitle_lang = data.get('language', 'ara')  # ISO 639-2 code
    
    if not subtitle_path:
        return jsonify({'error': 'subtitle_path is required'}), 400
    
    # Decode URL-encoded path
    from urllib.parse import unquote
    subtitle_path = unquote(subtitle_path)
    
    if not os.path.exists(subtitle_path):
        return jsonify({'error': f'Subtitle file not found: {subtitle_path}'}), 404
    
    # Determine output format (keep same container as source)
    video_ext = os.path.splitext(video_path)[1].lower()
    if video_ext not in ('.mp4', '.mkv', '.webm'):
        video_ext = '.mp4'  # Default to MP4 for other containers
    
    # Build output filename
    import re
    safe_title = re.sub(r'[<>:"/\\|?*]', '_', media.get('title', f'media_{media_id}'))
    output_filename = f"{safe_title}_merged{video_ext}"
    output_path = os.path.join(MERGE_CACHE_DIR, output_filename)
    
    # Check if already exists from a previous merge
    if os.path.exists(output_path):
        try:
            os.remove(output_path)
        except:
            pass
    
    job_id = str(uuid.uuid4())
    _merge_jobs[job_id] = {
        'status': 'starting',
        'progress': 0,
        'media_id': media_id,
        'title': media.get('title', ''),
        'output_filename': output_filename,
        'created_at': _time.time(),
    }
    
    # Start background merge
    import threading
    threading.Thread(
        target=_background_merge_subtitle,
        args=(video_path, subtitle_path, output_path, job_id, subtitle_lang),
        daemon=True
    ).start()
    
    return jsonify({
        'job_id': job_id,
        'status': 'starting',
        'message': 'Subtitle merge started'
    })


@app.route('/api/merge-status/<job_id>')
def api_merge_status(job_id):
    """Check subtitle merge job status"""
    job = _merge_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    
    response = {
        'status': job['status'],
        'progress': job.get('progress', 0),
        'title': job.get('title', ''),
    }
    
    if job['status'] == 'completed':
        filename = job.get('output_filename', os.path.basename(job.get('file_path', '')))
        response['download_url'] = f'/api/merge-download/{filename}'
        response['file_size'] = job.get('file_size', 0)
    elif job['status'] == 'failed':
        response['error'] = job.get('error', 'Unknown error')
    
    return jsonify(response)


@app.route('/api/merge-download/<path:filename>')
def api_merge_download(filename):
    """Download the merged video file"""
    file_path = os.path.join(MERGE_CACHE_DIR, filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    return send_file(file_path, as_attachment=True, download_name=filename)

@app.route('/api/stream/<int:media_id>')
def api_stream(media_id):
    """Stream media file with range support and real-time transcoding for browser compatibility"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    file_path = media.get('file_path')
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
        
    # SECURITY: Path Traversal Check
    if not is_safe_path(file_path):
        return jsonify({'error': 'Access Denied', 'message': 'File path is not in allowed library folders'}), 403
    
    ext = os.path.splitext(file_path)[1].lower()
    media_fmt = media.get('format')
    
    # Check if file needs transcoding for browser audio compatibility
    # TS files: need full transcode (video + audio)
    is_ts = ((media_fmt and media_fmt.upper() == 'TS') or ext == '.ts')
    
    # Optional: transcode audio for MKV with AC3/DTS (requested via query param or detected)
    transcode_audio = request.args.get('transcode') == 'audio'
    
    # Audio track selection (0-based index among audio streams)
    audio_track = request.args.get('audio_track', None)
    start_time = request.args.get('start_time', 0, type=float)
    if audio_track is not None:
        try:
            audio_track = int(audio_track)
        except (ValueError, TypeError):
            audio_track = None
    
    # If a non-default audio track is requested, we MUST remux through FFmpeg
    if audio_track is not None and audio_track > 0:
        try:
            return stream_with_audio_select(file_path, audio_track, start_time)
        except Exception as e:
            print(f"Audio track select failed: {e}, falling back to direct stream")
            return stream_file_direct(file_path)
    
    if not transcode_audio and not is_ts:
        pass # Reverted dynamic audio codec detection as requested
            
    if is_ts:
        try:
            return stream_with_transcoding(file_path)
        except Exception as e:
            print(f"Transcoding failed: {e}, falling back to direct stream")
            return stream_file_direct(file_path)
    
    if transcode_audio and ext in ('.mkv', '.avi', '.wmv', '.flv'):
        try:
            return stream_with_audio_fix(file_path)
        except Exception as e:
            print(f"Audio transcode failed: {e}, falling back to direct stream")
            return stream_file_direct(file_path)
    
    # Default: direct streaming (works for MP4, MKV video plays fine)
    return stream_file_direct(file_path)



def is_video_hevc(file_path, ffmpeg_path):
    try:
        import subprocess
        import os
        ffmpeg_dir = os.path.dirname(ffmpeg_path)
        ffprobe_exe = 'ffprobe.exe' if os.name == 'nt' else 'ffprobe'
        ffprobe_path = os.path.join(ffmpeg_dir, ffprobe_exe)
        result = subprocess.run([
            ffprobe_path, '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name', '-of', 'default=noprint_wrappers=1:nokey=1',
            file_path
        ], capture_output=True, text=True, timeout=2)
        return 'hevc' in result.stdout.strip().lower()
    except Exception:
        return False

def stream_with_audio_select(file_path, audio_index=0, start_time=0):
    """Stream video with a specific audio track selected via FFmpeg.
    Video is copied as-is, audio is transcoded to AAC for browser compatibility."""
    import subprocess
    from flask import Response
    
    ffmpeg_manager = get_ffmpeg_manager()
    ffmpeg_path = ffmpeg_manager.get_ffmpeg_path()
    
    if not ffmpeg_path:
        raise Exception("FFmpeg not found")
        
    is_hevc = is_video_hevc(file_path, ffmpeg_path)
    
    cmd = [
        ffmpeg_path,
        '-ss', str(start_time),
        '-i', file_path,
        '-map', '0:v:0',                          # First video stream
        '-map', f'0:a:{audio_index}',              # Selected audio stream
        '-c:v', 'copy',                            # Copy video (no re-encode)
    ]
    
    if is_hevc:
        cmd.extend(['-tag:v', 'hvc1'])
        
    cmd.extend([
        '-c:a', 'aac',                             # Transcode audio to AAC
        '-b:a', '192k',
        '-ac', '2',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        '-'  # Output to stdout
    ])
    
    def generate():
        process = None
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=65536
            )
            while True:
                chunk = process.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
        except Exception as e:
            print(f"Audio select streaming error: {e}")
            if process:
                process.terminate()
        finally:
            if process:
                process.wait()
    
    return Response(
        generate(),
        mimetype='video/mp4',
        headers={
            'Accept-Ranges': 'none',
            'Cache-Control': 'no-cache'
        }
    )

def stream_with_audio_fix(file_path):
    """Stream MKV/AVI with audio transcoded to AAC for browser compatibility.
    Video is copied as-is (no re-encoding) for speed."""
    import subprocess
    from flask import Response
    
    ffmpeg_manager = get_ffmpeg_manager()
    ffmpeg_path = ffmpeg_manager.get_ffmpeg_path()
    
    if not ffmpeg_path:
        raise Exception("FFmpeg not found")
    
    is_hevc = is_video_hevc(file_path, ffmpeg_path)
    
    cmd = [
        ffmpeg_path,
        '-i', file_path,
        '-map', '0:v:0',            # Explicitly take first video stream
        '-map', '0:a:0',            # Explicitly take first audio stream
        '-c:v', 'copy',             # Copy video stream (no re-encoding = fast)
    ]
    
    if is_hevc:
        cmd.extend(['-tag:v', 'hvc1'])
        
    cmd.extend([
        '-c:a', 'aac',              # Transcode audio to AAC (browser compatible)
        '-b:a', '192k',             # Audio bitrate
        '-ac', '2',                 # Stereo (some surround codecs cause issues)
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        '-'  # Output to stdout
    ])
    
    def generate():
        process = None
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=65536
            )
            
            while True:
                chunk = process.stdout.read(65536)
                if not chunk:
                    break
                yield chunk
                
        except Exception as e:
            print(f"Audio fix streaming error: {e}")
            if process:
                process.terminate()
        finally:
            if process:
                process.wait()
    
    return Response(
        generate(),
        mimetype='video/mp4',
        headers={
            'Accept-Ranges': 'none',
            'Cache-Control': 'no-cache'
        }
    )

def stream_with_transcoding(file_path):
    """Stream TS file with real-time FFmpeg transcoding to MP4"""
    import subprocess
    from flask import Response
    from transcode_utils import get_video_codec, get_transcode_options
    
    # Get FFmpeg path dynamically
    ffmpeg_manager = get_ffmpeg_manager()
    ffmpeg_path = ffmpeg_manager.get_ffmpeg_path()
    
    if not ffmpeg_path:
        raise Exception("FFmpeg not found. Please install FFmpeg or set the path in settings.")
    
    codec = get_video_codec()
    codec_options = get_transcode_options(codec)

    cmd = [
        ffmpeg_path,
        '-i', file_path,
        '-map', '0:v:0',            # Explicitly take first video stream
        '-map', '0:a:0',            # Explicitly take first audio stream
    ]
    
    cmd.extend(codec_options)
    
    cmd.extend([
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        '-'  # Output to stdout
    ])
    
    def generate():
        process = None
        try:
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=65536  # 64KB buffer
            )
            
            # Stream the output in chunks
            while True:
                chunk = process.stdout.read(65536)  # 64KB chunks
                if not chunk:
                    break
                yield chunk
                
        except Exception as e:
            print(f"Streaming error: {e}")
            if process:
                process.terminate()
        finally:
            if process:
                process.wait()
    
    return Response(
        generate(),
        mimetype='video/mp4',
        headers={
            'Accept-Ranges': 'none',  # Disable range requests for transcoded streams
            'Cache-Control': 'no-cache'
        }
    )

def stream_file_direct(file_path):
    """Direct file streaming with range support (for MP4, MKV, etc.)"""
    # Get file info
    mime_type = mimetypes.guess_type(file_path)[0] or 'video/mp4'
    
    # Use Flask's highly optimized conditional=True which natively handles Range requests
    # and utilizes the OS sendfile syscall or WSGI file_wrapper for zero-copy streaming.
    return send_file(file_path, mimetype=mime_type, conditional=True)

@app.route('/api/subtitles/<int:media_id>')
def get_subtitles(media_id):
    """Get available subtitles for a media item"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    subtitles = scanner.find_subtitles(media['file_path'])
    
    result = []
    for sub_path in subtitles:
        label = Path(sub_path).stem
        # Try to detect language from filename
        lang = 'ar' if 'arabic' in label.lower() or 'ar' in label.lower() else 'en'
        result.append({
            'path': sub_path,
            'label': label,
            'lang': lang
        })
    
    return jsonify(result)

@app.route('/api/subtitle/file')
def serve_subtitle():
    """Serve a subtitle file, converting to VTT if needed"""
    sub_path = request.args.get('path')
    if not sub_path or not os.path.exists(sub_path):
        return jsonify({'error': 'Subtitle not found'}), 404
    
    # Security: prevent path traversal - only serve files in library paths
    if not is_safe_path(sub_path):
        return jsonify({'error': 'Access denied'}), 403
    
    # Read subtitle file
    with open(sub_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Convert SRT to VTT if needed
    if sub_path.lower().endswith('.srt'):
        content = _convert_srt_to_vtt(content)
        return Response(content, mimetype='text/vtt')
    
    return Response(content, mimetype='text/vtt')

def _convert_srt_to_vtt(srt_content: str) -> str:
    """Convert SRT subtitle to VTT format"""
    # Add VTT header
    vtt = 'WEBVTT\n\n'
    
    # Replace SRT time format with VTT format
    # SRT: 00:00:00,000 -> VTT: 00:00:00.000
    content = srt_content.replace(',', '.')
    
    # Remove any BOM
    content = content.replace('\ufeff', '')
    
    # Split into blocks
    blocks = re.split(r'\n\s*\n', content.strip())
    
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) >= 2:
            # Skip the index number (first line if it's just a number)
            if lines[0].strip().isdigit():
                lines = lines[1:]
            
            if lines:
                vtt += '\n'.join(lines) + '\n\n'
    
    return vtt

# =============================================================================
# Media Tracks API (Audio & Embedded Subtitles)
# =============================================================================

# Language code to display name mapping
_LANG_NAMES = {
    'ara': 'العربية', 'ar': 'العربية',
    'eng': 'English', 'en': 'English',
    'fre': 'Français', 'fra': 'Français', 'fr': 'Français',
    'ger': 'Deutsch', 'deu': 'Deutsch', 'de': 'Deutsch',
    'spa': 'Español', 'es': 'Español',
    'ita': 'Italiano', 'it': 'Italiano',
    'por': 'Português', 'pt': 'Português',
    'rus': 'Русский', 'ru': 'Русский',
    'jpn': 'Japanese', 'ja': 'Japanese',
    'kor': 'Korean', 'ko': 'Korean',
    'chi': 'Chinese', 'zho': 'Chinese', 'zh': 'Chinese',
    'hin': 'Hindi', 'hi': 'Hindi',
    'tur': 'Türkçe', 'tr': 'Türkçe',
    'und': 'Unknown', '': 'Unknown',
}

def _lang_display(code):
    """Convert language code to display name"""
    if not code:
        return 'Unknown'
    return _LANG_NAMES.get(code.lower(), code.upper())

@app.route('/api/media/<int:media_id>/tracks', methods=['GET'])
def api_get_media_tracks(media_id):
    """Get all audio tracks and embedded subtitle tracks from a media file using ffprobe"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404

    file_path = media.get('file_path')
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404

    ffmpeg_manager = get_ffmpeg_manager()
    ffprobe_path = ffmpeg_manager.get_ffprobe_path()

    if not ffprobe_path:
        return jsonify({'audio_tracks': [], 'subtitle_tracks': [], 'error': 'FFprobe not available'}), 200

    try:
        import subprocess
        cmd = [
            ffprobe_path,
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            '-show_entries', 'stream=index,codec_type,codec_name,channels,channel_layout,sample_rate,disposition',
            '-show_entries', 'stream_tags=language,title,handler_name',
            file_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            encoding='utf-8',
            errors='replace',
            check=False,
            timeout=15
        )

        if not result.stdout.strip():
            return jsonify({'audio_tracks': [], 'subtitle_tracks': []}), 200

        data = json.loads(result.stdout)
        streams = data.get('streams', [])

        audio_tracks = []
        subtitle_tracks = []
        audio_idx = 0
        sub_idx = 0

        for stream in streams:
            codec_type = stream.get('codec_type', '')
            tags = stream.get('tags', {})
            lang_code = tags.get('language', '')
            title = tags.get('title', '') or tags.get('handler_name', '')
            disposition = stream.get('disposition', {})
            is_default = disposition.get('default', 0) == 1
            is_forced = disposition.get('forced', 0) == 1

            if codec_type == 'audio':
                channels = stream.get('channels', 0)
                channel_layout = stream.get('channel_layout', '')
                codec_name = stream.get('codec_name', '')

                # Build descriptive label
                label_parts = []
                lang_name = _lang_display(lang_code)
                label_parts.append(lang_name)
                if title:
                    label_parts.append(f'({title})')
                if channels:
                    ch_map = {1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1'}
                    ch_label = ch_map.get(channels, f'{channels}ch')
                    label_parts.append(f'[{ch_label}]')
                if codec_name:
                    label_parts.append(f'• {codec_name.upper()}')

                audio_tracks.append({
                    'index': stream.get('index'),
                    'audio_index': audio_idx,
                    'language': lang_code,
                    'language_name': lang_name,
                    'title': title,
                    'codec': codec_name,
                    'channels': channels,
                    'channel_layout': channel_layout,
                    'is_default': is_default,
                    'label': ' '.join(label_parts),
                })
                audio_idx += 1

            elif codec_type == 'subtitle':
                codec_name = stream.get('codec_name', '')

                # Build label
                lang_name = _lang_display(lang_code)
                label_parts = [lang_name]
                if title:
                    label_parts.append(f'({title})')
                if is_forced:
                    label_parts.append('[Forced]')
                if codec_name:
                    label_parts.append(f'• {codec_name.upper()}')

                subtitle_tracks.append({
                    'index': stream.get('index'),
                    'subtitle_index': sub_idx,
                    'language': lang_code,
                    'language_name': lang_name,
                    'title': title,
                    'codec': codec_name,
                    'is_default': is_default,
                    'is_forced': is_forced,
                    'label': ' '.join(label_parts),
                })
                sub_idx += 1

        return jsonify({
            'audio_tracks': audio_tracks,
            'subtitle_tracks': subtitle_tracks,
        })

    except subprocess.TimeoutExpired:
        logger.warning(f"FFprobe timeout for media {media_id}")
        return jsonify({'audio_tracks': [], 'subtitle_tracks': [], 'error': 'Timeout'}), 200
    except Exception as e:
        logger.error(f"Error getting tracks for media {media_id}: {e}")
        return jsonify({'audio_tracks': [], 'subtitle_tracks': [], 'error': str(e)}), 200

@app.route('/api/media/<int:media_id>/audio/remove-track', methods=['POST'])
def api_remove_audio_track(media_id):
    """
    Remove specified audio track(s) from a media file on disk using FFmpeg stream copy.
    Lossless and fast (no re-encoding quality loss).
    """
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404

    file_path = media.get('file_path')
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'File not found on disk'}), 404

    data = request.get_json() or {}
    remove_idx = data.get('remove_audio_index')
    keep_idx = data.get('keep_audio_index')

    if remove_idx is None and keep_idx is None:
        return jsonify({'error': 'Specify remove_audio_index or keep_audio_index'}), 400

    ffmpeg_manager = get_ffmpeg_manager()
    ffmpeg_path = ffmpeg_manager.get_ffmpeg_path()
    ffprobe_path = ffmpeg_manager.get_ffprobe_path()

    if not ffmpeg_path or not ffprobe_path:
        return jsonify({'error': 'FFmpeg / FFprobe not available'}), 500

    try:
        import subprocess, json
        # Inspect streams with ffprobe
        probe_cmd = [
            ffprobe_path,
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            file_path
        ]
        probe_res = subprocess.run(probe_cmd, capture_output=True, encoding='utf-8', errors='replace', timeout=15)
        if probe_res.returncode != 0 or not probe_res.stdout.strip():
            return jsonify({'error': 'Failed to probe video streams'}), 500

        probe_data = json.loads(probe_res.stdout)
        streams = probe_data.get('streams', [])

        audio_streams = [s for s in streams if s.get('codec_type') == 'audio']
        total_audio = len(audio_streams)

        if total_audio <= 1:
            return jsonify({'error': 'Cannot remove track: file has only 1 audio track'}), 400

        # Determine audio stream indices to keep
        if keep_idx is not None:
            if keep_idx < 0 or keep_idx >= total_audio:
                return jsonify({'error': f'Invalid keep_audio_index: {keep_idx}'}), 400
            audio_indices_to_keep = [keep_idx]
        else:
            if remove_idx < 0 or remove_idx >= total_audio:
                return jsonify({'error': f'Invalid remove_audio_index: {remove_idx}'}), 400
            audio_indices_to_keep = [i for i in range(total_audio) if i != remove_idx]

        if not audio_indices_to_keep:
            return jsonify({'error': 'Cannot remove all audio tracks'}), 400

        ext = os.path.splitext(file_path)[1]
        temp_output = file_path + f".tmp_strip_{_time.time_ns()}{ext}"

        # FFmpeg command for zero-copy stream mapping
        cmd = [ffmpeg_path, '-y', '-i', file_path, '-map', '0:v']
        for a_idx in audio_indices_to_keep:
            cmd.extend(['-map', f'0:a:{a_idx}'])
        cmd.extend(['-map', '0:s?'])
        cmd.extend(['-map', '0:t?'])
        cmd.extend(['-c', 'copy'])
        cmd.extend(['-disposition:a:0', 'default'])
        cmd.append(temp_output)

        session_logger.log_backend('INFO', f"Running FFmpeg audio strip for media {media_id}: {' '.join(cmd)}")

        result = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace', timeout=300)

        if result.returncode != 0 or not os.path.exists(temp_output) or os.path.getsize(temp_output) == 0:
            if os.path.exists(temp_output):
                try: os.remove(temp_output)
                except: pass
            err_msg = result.stderr[:300] if result.stderr else 'FFmpeg error'
            return jsonify({'error': f'FFmpeg audio strip failed: {err_msg}'}), 500

        new_size = os.path.getsize(temp_output)
        backup_path = file_path + f".bak_{_time.time_ns()}"

        success_replace = False
        for attempt in range(5):
            try:
                os.replace(file_path, backup_path)
                os.replace(temp_output, file_path)
                if os.path.exists(backup_path):
                    try: os.remove(backup_path)
                    except: pass
                success_replace = True
                break
            except Exception as e:
                _time.sleep(0.5)

        if not success_replace:
            try:
                import shutil
                shutil.copy2(temp_output, file_path)
                os.remove(temp_output)
                if os.path.exists(backup_path):
                    try: os.remove(backup_path)
                    except: pass
                success_replace = True
            except Exception as e:
                return jsonify({'error': f'Failed to update file on disk (file may be locked): {e}'}), 500

        # Update database size_bytes
        try:
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE media SET size_bytes = ? WHERE id = ?", (new_size, media_id))
                conn.commit()
        except Exception as db_err:
            session_logger.log_backend('WARNING', f"Failed to update size_bytes for media {media_id}: {db_err}")

        return jsonify({
            'success': True,
            'message': 'Audio track removed successfully',
            'remaining_audio_count': len(audio_indices_to_keep),
            'new_size': new_size
        })

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'FFmpeg operation timed out'}), 500
    except Exception as e:
        session_logger.log_backend('ERROR', f"Error removing audio track for media {media_id}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/media/<int:media_id>/subtitles/embedded/<int:track_index>')
def api_get_embedded_subtitle(media_id, track_index):
    """Extract an embedded subtitle track from a media file and serve it as WebVTT"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404

    file_path = media.get('file_path')
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404

    ffmpeg_manager = get_ffmpeg_manager()
    ffmpeg_path = ffmpeg_manager.get_ffmpeg_path()

    if not ffmpeg_path:
        return jsonify({'error': 'FFmpeg not available'}), 500

    try:
        import subprocess
        cmd = [
            ffmpeg_path,
            '-i', file_path,
            '-map', f'0:s:{track_index}',   # Select the subtitle stream by index
            '-c:s', 'webvtt',                # Convert to WebVTT format
            '-f', 'webvtt',
            '-'                              # Output to stdout
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=30
        )

        if result.returncode != 0:
            stderr_text = result.stderr.decode('utf-8', errors='replace') if result.stderr else ''
            logger.warning(f"FFmpeg subtitle extract failed for media {media_id} track {track_index}: {stderr_text[:200]}")
            return Response('WEBVTT\n\n', mimetype='text/vtt')

        vtt_content = result.stdout
        if not vtt_content:
            return Response('WEBVTT\n\n', mimetype='text/vtt')

        return Response(
            vtt_content,
            mimetype='text/vtt',
            headers={
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600',
            }
        )

    except subprocess.TimeoutExpired:
        logger.warning(f"FFmpeg subtitle extract timeout for media {media_id}")
        return Response('WEBVTT\n\n', mimetype='text/vtt')
    except Exception as e:
        logger.error(f"Error extracting subtitle for media {media_id}: {e}")
        return Response('WEBVTT\n\n', mimetype='text/vtt')

@app.route('/api/media/<int:media_id>/hide', methods=['POST'])
def hide_media_item(media_id):
    """Hide a media item and prevent it from appearing in future scans"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    file_path = media.get('file_path') or media.get('folder_path')
    if file_path:
        hide_path(file_path)
        delete_media(media_id)
        return jsonify({'success': True, 'message': 'Media hidden successfully'})
    
    return jsonify({'error': 'Invalid media path'}), 400

@app.route('/api/recommendations/<int:media_id>')
def api_tmdb_recommendations(media_id):
    """Get AI recommendations from TMDb for a specific media item"""
    # --- Cache: 30 min TTL to prevent 24s TMDB calls on every page open ---
    only_local = request.args.get('only_local') == 'true'
    limit = request.args.get('limit', 12, type=int)
    cache_key = f"recs:{media_id}:local={only_local}:limit={limit}"
    cached = cached_response(cache_key, ttl_seconds=1800)
    if cached is not None:
        return jsonify(cached)
    # -----------------------------------------------------------------------

    media = get_media_by_id(media_id)
    if not media:
        return jsonify([])
        
    tmdb_id = media.get('tmdb_id')
    media_type = media.get('type')
    
    # For episodes, use the Series ID for recommendations
    if media_type == 'episode' and media.get('series_id'):
        series = get_media_by_id(media['series_id'])
        if series and series.get('tmdb_id'):
            tmdb_id = series['tmdb_id']
            media_type = 'series'
            
    # FALLBACK: If no TMDB ID, try to find it by title search
    if not tmdb_id:
        try:
            fetcher = MetadataFetcher()
            search_title = None
            search_type = None
            
            if media_type == 'series':
                search_title = media.get('title')
                search_type = 'tv'
            elif media_type == 'episode' and media.get('series_id'):
                 # Should have been handled above, but double check
                 series = get_media_by_id(media['series_id'])
                 if series:
                     search_title = series.get('title')
                     search_type = 'tv'
            elif media_type == 'movie':
                search_title = media.get('title')
                search_type = 'movie'
            
            if search_title and search_type:
                print(f"Fallback: Searching TMDB for {search_title} ({search_type})")
                if search_type == 'tv':
                    found = fetcher.search_tv(search_title)
                else:
                    found = fetcher.search_movie(search_title)
                
                if found and found.get('tmdb_id'):
                    tmdb_id = found['tmdb_id']
                    # Update media type if we found a series
                    if search_type == 'tv':
                        media_type = 'series'
                        
        except Exception as e:
            print(f"Error in recommendation fallback search: {e}")

    if not tmdb_id:
        return jsonify([])
    
    # TMDB API uses 'tv' not 'series'
    tmdb_type = 'tv' if media_type == 'series' else media_type
        
    try:
        fetcher = MetadataFetcher()
        # Pass limit to fetcher
        recs = fetcher.get_recommendations(tmdb_id, tmdb_type, limit=limit)
        
        # Check if items are in our library
        for rec in recs:
            if rec.get('tmdb_id'):
                existing = get_media_by_tmdb_id(rec['tmdb_id'])
                if existing:
                    rec['in_library'] = True
                    rec['library_id'] = existing['id']
                    # Use local duration (seconds) for runtime badge
                    if existing.get('duration'):
                        rec['runtime'] = existing['duration']
        
        # FILTERING: If requested, return ONLY local content using Smart Local Engine
        if only_local:
            # Use Local AI Recommendation Engine (Cross-media, TF-IDF NLP based)
            local_recs = get_ai_recommendations(media_id, limit)
            for r in local_recs:
                r['in_library'] = True
                r['is_local_ai'] = True  # Flag to identify source
                
            # Keep TMDb recommendations that are in the local library
            tmdb_local_recs = [r for r in recs if r.get('in_library')]
            
            # Merge them, prioritizing the local AI NLP (which uses categories/genres heavily)
            merged = local_recs.copy()
            # Add TMDb ones that aren't already in the list
            existing_ids = {r['id'] for r in merged if 'id' in r}
            for tmdb_rec in tmdb_local_recs:
                if 'library_id' in tmdb_rec and tmdb_rec['library_id'] not in existing_ids:
                    # Rename library_id to id to match local format
                    tmdb_rec['id'] = tmdb_rec['library_id']
                    merged.append(tmdb_rec)
                    existing_ids.add(tmdb_rec['id'])
                    
            result = merged[:limit]
            set_cache(cache_key, result, ttl_seconds=1800)
            return jsonify(result)
            
        # SORTING: User requested default TMDB priority (Discovery first)
        # Sort by in_library (False=0, True=1). reverse=False -> 0 then 1.
        # So items NOT in library come first.
        recs.sort(key=lambda x: x.get('in_library', False), reverse=False)
        set_cache(cache_key, recs, ttl_seconds=1800)
        return jsonify(recs)
    except Exception as e:
        print(f"Error fetching recommendations: {e}")
        return jsonify([])

@app.route('/api/debug/recommendations/<int:media_id>')
def api_debug_recommendations(media_id):
    """Debug endpoint to diagnose recommendation failures"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'media not found', 'media_id': media_id})
    
    result = {
        'media_id': media_id,
        'title': media.get('title'),
        'type': media.get('type'),
        'tmdb_id': media.get('tmdb_id'),
        'series_id': media.get('series_id'),
        'resolved_tmdb_id': None,
        'resolved_type': None,
        'recommendation_count': 0,
        'error': None
    }
    
    tmdb_id = media.get('tmdb_id')
    media_type = media.get('type')
    
    if media_type == 'episode' and media.get('series_id'):
        series = get_media_by_id(media['series_id'])
        result['series_title'] = series.get('title') if series else None
        result['series_tmdb_id'] = series.get('tmdb_id') if series else None
        if series and series.get('tmdb_id'):
            tmdb_id = series['tmdb_id']
            media_type = 'series'
    
    result['resolved_tmdb_id'] = tmdb_id
    result['resolved_type'] = media_type
    
    if not tmdb_id:
        result['error'] = 'no tmdb_id resolved'
        return jsonify(result)
    
    tmdb_type = 'tv' if media_type == 'series' else media_type
    result['tmdb_api_type'] = tmdb_type
    
    try:
        fetcher = MetadataFetcher()
        recs = fetcher.get_recommendations(tmdb_id, tmdb_type)
        result['recommendation_count'] = len(recs)
        result['first_3'] = [r.get('title') for r in recs[:3]]
    except Exception as e:
        result['error'] = str(e)
    
    return jsonify(result)

# =============================================================================
# Settings API
# =============================================================================

@app.route('/api/settings', methods=['GET'])
def api_get_settings():
    """Get all settings"""
    return jsonify({
        'theme': get_setting('theme', 'dark'),
        'tmdb_api_key': get_setting('tmdb_api_key', ''),
        'auto_scan': get_setting('auto_scan', 'true'),
    })

@app.route('/api/settings', methods=['POST'])
def api_save_settings():
    """Save settings"""
    data = request.get_json(silent=True) or {}
    
    for key, value in data.items():
        set_setting(key, str(value))
    
    # Update TMDb API key if changed
    if 'tmdb_api_key' in data:
        global fetcher
        fetcher = MetadataFetcher(data['tmdb_api_key'])
    
    return jsonify({'success': True})

# =============================================================================
# Browsing API
# =============================================================================

@app.route('/api/genres', methods=['GET'])
def api_get_genres():
    """Get all unique genres from database"""
    from database import get_connection
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            # Select unique genres strings
            cursor.execute('SELECT DISTINCT genres FROM media WHERE genres IS NOT NULL AND genres != ""')
            rows = cursor.fetchall()
            
            # Parse and deduplicate
            unique_genres = set()
            for row in rows:
                if row['genres']:
                    # Genres are comma separated
                    parts = [g.strip() for g in row['genres'].split(',')]
                    unique_genres.update(parts)
            
            return jsonify(sorted(list(unique_genres)))
    except Exception as e:
        print(f"Error getting genres: {e}")
        return jsonify([])

# =============================================================================
# Favorites API
# =============================================================================

@app.route('/api/favorites', methods=['GET'])
def api_get_favorites():
    """Get all favorite media (profile-aware)"""
    profile_id = get_request_profile()
    favorites = get_all_favorites(profile_id=profile_id)
    return jsonify(favorites)

@app.route('/api/favorites/<int:media_id>', methods=['POST'])
def api_add_favorite(media_id):
    """Add media to favorites (profile-aware)"""
    profile_id = get_request_profile()
    success = add_to_favorites(media_id, profile_id=profile_id)
    return jsonify({'success': success})

@app.route('/api/favorites/<int:media_id>', methods=['DELETE'])
def api_remove_favorite(media_id):
    """Remove media from favorites (profile-aware)"""
    profile_id = get_request_profile()
    success = remove_from_favorites(media_id, profile_id=profile_id)
    return jsonify({'success': success})

@app.route('/api/favorites/<int:media_id>/status', methods=['GET'])
def api_check_favorite(media_id):
    """Check if media is favorite (profile-aware)"""
    profile_id = get_request_profile()
    is_fav = is_favorite(media_id, profile_id=profile_id)
    return jsonify({'is_favorite': is_fav})

# =============================================================================
# Profiles API
# =============================================================================

@app.route('/api/profiles', methods=['GET'])
def api_get_profiles():
    """Get all profiles with their assigned IPs"""
    profiles = get_all_profiles()
    return jsonify(profiles)

@app.route('/api/profiles/current', methods=['GET'])
def api_get_current_profile():
    """Get the current profile resolved from header or request IP"""
    ip = request.remote_addr or '127.0.0.1'
    profile_id = get_request_profile()
    profile = get_profile_by_id(profile_id)
    if profile:
        profile['current_ip'] = ip
    return jsonify(profile or {'id': 1, 'name': 'افتراضي', 'current_ip': ip})

@app.route('/api/profiles', methods=['POST'])
def api_create_profile():
    """Create a new profile"""
    data = request.json or {}
    name = data.get('name', '').strip()
    avatar_color = data.get('avatar_color', '#6366f1')
    default_audio_lang = data.get('default_audio_lang', 'auto')
    default_sub_lang = data.get('default_sub_lang', 'off')
    if not name:
        return jsonify({'error': 'Profile name is required'}), 400
    profile_id = create_profile(name, avatar_color, default_audio_lang, default_sub_lang)
    return jsonify({'success': True, 'id': profile_id})

@app.route('/api/profiles/<int:profile_id>', methods=['PUT'])
def api_update_profile(profile_id):
    """Update profile name/color/languages"""
    data = request.json or {}
    update_profile(
        profile_id, 
        name=data.get('name'), 
        avatar_color=data.get('avatar_color'),
        default_audio_lang=data.get('default_audio_lang'),
        default_sub_lang=data.get('default_sub_lang')
    )
    return jsonify({'success': True})

@app.route('/api/profiles/<int:profile_id>', methods=['DELETE'])
def api_delete_profile(profile_id):
    """Delete a profile (cannot delete default)"""
    if profile_id == 1:
        return jsonify({'error': 'Cannot delete the default profile'}), 400
    success = delete_profile(profile_id)
    return jsonify({'success': success})

@app.route('/api/profiles/<int:profile_id>/ips', methods=['POST'])
def api_assign_ip(profile_id):
    """Assign an IP address to a profile"""
    data = request.json or {}
    ip = data.get('ip', '').strip()
    if not ip:
        return jsonify({'error': 'IP address is required'}), 400
    success = assign_ip(profile_id, ip)
    return jsonify({'success': success})

@app.route('/api/profiles/<int:profile_id>/ips/<ip>', methods=['DELETE'])
def api_remove_ip(profile_id, ip):
    """Remove an IP from a profile"""
    success = remove_ip(ip)
    return jsonify({'success': success})

@app.route('/api/profiles/assign-current', methods=['POST'])
def api_assign_current_ip():
    """Assign the current request IP to a profile"""
    data = request.json or {}
    profile_id = data.get('profile_id')
    if not profile_id:
        return jsonify({'error': 'profile_id is required'}), 400
    ip = request.remote_addr or '127.0.0.1'
    success = assign_ip(profile_id, ip)
    return jsonify({'success': success, 'ip': ip})

@app.route('/api/profiles/<int:profile_id>/avatar', methods=['POST'])
def api_upload_avatar(profile_id):
    """Upload a profile avatar image"""
    if 'avatar' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Ensure avatars directory exists
    avatars_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'avatars')
    os.makedirs(avatars_dir, exist_ok=True)
    
    # Save with profile_id as filename
    ext = os.path.splitext(file.filename)[1].lower() or '.png'
    if ext not in ('.jpg', '.jpeg', '.png', '.gif', '.webp'):
        return jsonify({'error': 'Unsupported image format'}), 400
    
    filename = f'profile_{profile_id}{ext}'
    filepath = os.path.join(avatars_dir, filename)
    file.save(filepath)
    
    # Update profile with avatar URL
    avatar_url = f'/api/profiles/{profile_id}/avatar'
    update_profile(profile_id, avatar_url=avatar_url)
    
    return jsonify({'success': True, 'avatar_url': avatar_url})

@app.route('/api/profiles/<int:profile_id>/avatar', methods=['GET'])
def api_serve_avatar(profile_id):
    """Serve a profile avatar image"""
    avatars_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'avatars')
    
    # Try to find the avatar file with any extension
    for ext in ('.png', '.jpg', '.jpeg', '.gif', '.webp'):
        filename = f'profile_{profile_id}{ext}'
        filepath = os.path.join(avatars_dir, filename)
        if os.path.exists(filepath):
            return send_from_directory(avatars_dir, filename)
    
    return jsonify({'error': 'Avatar not found'}), 404

@app.route('/api/profiles/<int:profile_id>/avatar', methods=['DELETE'])
def api_delete_avatar(profile_id):
    """Delete a profile avatar image"""
    avatars_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'avatars')
    
    # Remove avatar files
    for ext in ('.png', '.jpg', '.jpeg', '.gif', '.webp'):
        filepath = os.path.join(avatars_dir, f'profile_{profile_id}{ext}')
        if os.path.exists(filepath):
            os.remove(filepath)
    
    # Clear avatar_url in DB
    update_profile(profile_id, avatar_url='')
    return jsonify({'success': True})

# =============================================================================
# Recommendations API
# =============================================================================

@app.route('/api/recommendations', methods=['GET'])
def api_get_recommendations():
    """Get recommended media"""
    media_id = request.args.get('media_id', type=int)
    limit = request.args.get('limit', 10, type=int)
    recommendations = get_recommendations(media_id, limit)
    return jsonify(recommendations)

# =============================================================================
# Timeline Thumbnails API
# =============================================================================

from timeline_thumbs import get_timeline_thumbnails

@app.route('/api/thumbnails/generate/<int:media_id>', methods=['POST'])
def api_generate_timeline_thumbs(media_id):
    """Generate timeline thumbnails for a video"""
    try:
        media = get_media_by_id(media_id)
        if not media:
            return jsonify({'error': 'Media not found'}), 404
        
        video_path = media.get('file_path')
        if not video_path:
            return jsonify({'error': 'No video file path'}), 400
        
        if not os.path.exists(video_path):
            return jsonify({'error': f'Video file not found: {video_path}'}), 400
        
        # Get duration from DB, or from request body if provided
        duration = media.get('duration', 0)
        
        # If duration is 0 or missing, try to get from request (frontend knows the real duration)
        if request.json and request.json.get('duration'):
            duration = int(request.json.get('duration'))
        
        # Still no duration? Try FFprobe
        if not duration or duration == 0:
            try:
                from ffmpeg_utils import get_ffmpeg_manager
                ffmpeg = get_ffmpeg_manager()
                video_info = ffmpeg.get_video_info(video_path)
                if video_info and video_info.get('duration'):
                    duration = int(float(video_info['duration']))
                    print(f"[Thumbnails] Got duration from FFprobe: {duration}s for media {media_id}")
            except Exception as probe_err:
                print(f"[Thumbnails] FFprobe failed: {probe_err}")
        
        if not duration or duration == 0:
            return jsonify({'error': 'Could not determine video duration', 'media_id': media_id}), 400
        
        interval = request.json.get('interval', 10) if request.json else 10
        
        print(f"[Thumbnails] Generating for media {media_id}: duration={duration}s, interval={interval}s")
        
        thumbs = get_timeline_thumbnails()
        result = thumbs.generate_thumbnails(media_id, video_path, duration, interval)
        
        print(f"[Thumbnails] Result for media {media_id}: {result.get('count', 0)} thumbnails generated")
        
        return jsonify(result)
        
    except Exception as e:
        print(f"[Thumbnails] ERROR for media {media_id}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/thumbnails/<int:media_id>', methods=['GET'])
def api_get_timeline_thumbs(media_id):
    """Get all timeline thumbnails for a media"""
    thumbs = get_timeline_thumbnails()
    thumbnails = thumbs.get_all_thumbnails(media_id)
    return jsonify(thumbnails)



@app.route('/api/logs', methods=['POST'])
def api_client_logs():
    """Receive client logs from React frontend and record in session log"""
    try:
        data = request.get_json(silent=True) or {}
        level = data.get('level', 'info')
        message = data.get('message', '')
        url = data.get('url', request.referrer)
        user_agent = request.headers.get('User-Agent')
        session_logger.log_frontend(level, message, url=url, user_agent=user_agent)
    except Exception as e:
        print(f"[SessionLogger API Error] {e}")
    return jsonify({'success': True})

@app.route('/api/thumbnails/<int:media_id>/<filename>', methods=['GET'])
def api_serve_thumbnail(media_id, filename):
    """Serve a thumbnail image"""
    from pathlib import Path
    thumb_dir = Path(__file__).parent.parent / 'data' / 'thumbnails' / str(media_id)
    return send_from_directory(thumb_dir, filename)



# =============================================================================
# ADMIN Panel API
# =============================================================================


@app.route('/api/admin/run-tests', methods=['GET', 'POST'])
def api_admin_run_tests():
    """Run backend unit tests and return JSON results"""
    import pytest
    import traceback
    
    class JSONReportPlugin:
        def __init__(self):
            self.results = []
            self.passed = 0
            self.failed = 0
            
        def pytest_runtest_logreport(self, report):
            if report.when == "call":
                if report.passed:
                    self.passed += 1
                elif report.failed:
                    self.failed += 1
                
                self.results.append({
                    "name": report.nodeid.split('::')[-1],
                    "file": report.nodeid.split('::')[0],
                    "outcome": "passed" if report.passed else "failed" if report.failed else "skipped",
                    "duration": round(report.duration, 3),
                    "error": str(report.longrepr) if report.failed else None
                })
                
    try:
        plugin = JSONReportPlugin()
        exit_code = pytest.main(['-q', '--disable-warnings', 'tests/'], plugins=[plugin])
        
        # Exit code meanings:
        # 0: All tests passed
        # 1: Some tests failed
        # 2: Interrupted
        # 3: Internal error
        # 4: Usage error
        # 5: No tests collected
        
        return jsonify({
            'success': exit_code in [0, 1],
            'exit_code': int(exit_code),
            'total': plugin.passed + plugin.failed,
            'passed': plugin.passed,
            'failed': plugin.failed,
            'results': plugin.results,
            'error': "No tests were found in the 'tests/' directory." if exit_code == 5 else None if exit_code in [0, 1] else f"Pytest exited with code {exit_code}"
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500

# =============================================================================
# Entry Point
# =============================================================================

def get_local_ip():
    """Get local IP address for network access"""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

if __name__ == '__main__':
    from auto_scanner import auto_scanner
    
    # Initialize database
    init_db()
    
    # Start the automatic background library scanner
    if get_setting('auto_scan', 'true') == 'true':
        auto_scanner.start(scan_callback=_background_scan)
    
    # Get local IP
    local_ip = get_local_ip()
    port = 5000
    
    print("\n" + "="*60)
    print("  [*] CinemaStream - Media Library Server")
    print("="*60)
    print(f"\n  Local:    http://localhost:{port}")
    print(f"  Network:  http://{local_ip}:{port}")
    print("\n  Access from any device on your network!")
    print("="*60 + "\n")
    
    # Run server
    # Run server (Production settings: debug=False)
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
