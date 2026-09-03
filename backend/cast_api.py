# Cast API Module for SmartCinema
# Provides cast member details and filmography
# Includes local caching for images and data (offline support)

import json
import os
import time
import hashlib
import uuid
import urllib.request
import urllib.parse
from flask import Blueprint, jsonify, request, send_file, Response
from database import get_connection, get_media_by_id

cast_bp = Blueprint('cast', __name__)

# TMDb API for fetching full filmography
TMDB_API_KEY = '0b1762ea5ebd14681d16fb9d19919c9a'
TMDB_BASE_URL = 'https://api.themoviedb.org/3'

# =============================================================================
# LOCAL CACHE SYSTEM
# =============================================================================
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache')
IMAGE_CACHE_DIR = os.path.join(CACHE_DIR, 'images')
DATA_CACHE_DIR = os.path.join(CACHE_DIR, 'data')
FILMOGRAPHY_CACHE_TTL = 86400  # 24 hours

# Create cache directories
os.makedirs(IMAGE_CACHE_DIR, exist_ok=True)
os.makedirs(DATA_CACHE_DIR, exist_ok=True)

def _get_image_cache_path(tmdb_path: str, size: str = 'w342') -> str:
    """Get local file path for a cached TMDb image"""
    # tmdb_path is like /abc123.jpg
    safe_name = tmdb_path.lstrip('/').replace('/', '_')
    return os.path.join(IMAGE_CACHE_DIR, f"{size}_{safe_name}")

def _download_and_cache_image(tmdb_path: str, size: str = 'w342') -> str | None:
    """Download image from TMDb and save to local cache. Returns local path or None."""
    if not tmdb_path:
        return None
    
    local_path = _get_image_cache_path(tmdb_path, size)
    
    # Check if exists and has content (not 0 bytes)
    if os.path.exists(local_path):
        if os.path.getsize(local_path) > 0:
            return local_path
        else:
            # Remove empty file
            try:
                os.remove(local_path)
            except OSError:
                pass
    
    # SSL Context to ignore verification errors if needed
    # SSL Context to ignore verification errors if needed
    import ssl
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    # Atomic write: download to UNIQUE temp file then rename
    # Fixes [WinError 32] race conditions
    temp_path = local_path + f".{uuid.uuid4()}.tmp"
    
    for attempt in range(3):
        try:
            url = f"https://image.tmdb.org/t/p/{size}{tmdb_path}"
            req = urllib.request.Request(url, headers={'User-Agent': 'SmartCinema/1.0'})
            
            with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                with open(temp_path, 'wb') as f:
                    f.write(resp.read())
            
            # Verify file size
            if os.path.getsize(temp_path) > 0:
                os.replace(temp_path, local_path)
                return local_path
            else:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                
        except Exception as e:
            if attempt == 2:
                print(f"[Cache] Failed to download image {tmdb_path}: {e}")
            
            # Cleanup temp file
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            
            time.sleep(1)
            
    return None

def _cache_image_async(tmdb_path: str, size: str = 'w342'):
    """Download image in background thread (non-blocking)"""
    if not tmdb_path:
        return
    local_path = _get_image_cache_path(tmdb_path, size)
    
    # Check if valid file exists
    if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
        return  # Already cached and valid
        
    import threading
    threading.Thread(target=_download_and_cache_image, args=(tmdb_path, size), daemon=True).start()

def _get_local_image_url(tmdb_path: str, size: str = 'w342') -> str:
    """Get the local API URL for a cached image"""
    if not tmdb_path:
        return ''
    safe_name = tmdb_path.lstrip('/').replace('/', '_')
    # Add version to bust browser cache of broken/empty files
    return f"/api/cast/image/{size}/{safe_name}?v=1"

def _cache_filmography_data(person_id: int, data: list) -> None:
    """Cache filmography JSON data"""
    cache_file = os.path.join(DATA_CACHE_DIR, f"filmography_{person_id}.json")
    with open(cache_file, 'w', encoding='utf-8') as f:
        json.dump({'timestamp': time.time(), 'data': data}, f, ensure_ascii=False)

def _get_cached_filmography(person_id: int) -> list | None:
    """Get cached filmography data if still valid"""
    cache_file = os.path.join(DATA_CACHE_DIR, f"filmography_{person_id}.json")
    if not os.path.exists(cache_file):
        return None
    try:
        with open(cache_file, 'r', encoding='utf-8') as f:
            cached = json.load(f)
        if time.time() - cached['timestamp'] < FILMOGRAPHY_CACHE_TTL:
            data = cached['data']
            
            # Check for genre_ids (cache invalidation for new feature)
            if data and 'genre_ids' not in data[0]:
                return None
                
            # Regenerate URLs to ensure they use current logic (cache buster)
            for item in data:
                if item.get('poster_path'):
                    item['poster_url'] = _get_local_image_url(item['poster_path'], 'w342')
                if item.get('profile_path'):
                    item['profile_url'] = _get_local_image_url(item['profile_path'], 'w185')
            return data
    except Exception:
        pass
    return None

def tmdb_request(endpoint: str, params: dict = None) -> dict:
    """Make a request to TMDb API"""
    params = params or {}
    params['api_key'] = TMDB_API_KEY
    url = f"{TMDB_BASE_URL}{endpoint}?{urllib.parse.urlencode(params)}"
    try:
        req = urllib.request.Request(url, headers={'Accept': 'application/json'})
        # Increased timeout to 60s for large filmographies
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"TMDb API error: {e}")
        return {}

def get_person_by_id(person_id: int):
    """Get a cast member by their internal ID"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM cast_members WHERE id = ?
        """, (person_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_person_by_tmdb_id(tmdb_person_id: int):
    """Get a cast member by their TMDB person ID"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM cast_members WHERE tmdb_person_id = ?
        """, (tmdb_person_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_person_filmography(person_id: int):
    """Get all media in the library featuring this person"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.*, mc.character_name, mc.cast_order
            FROM media m
            JOIN media_cast mc ON m.id = mc.media_id
            WHERE mc.person_id = ?
            ORDER BY m.year DESC, mc.cast_order ASC
        """, (person_id,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_all_actors(page: int = 1, limit: int = 24, search: str = None):
    """Get all actors with pagination and optional search"""
    offset = (page - 1) * limit
    
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Count total
        if search:
            cursor.execute("""
                SELECT COUNT(DISTINCT cm.id)
                FROM cast_members cm
                JOIN media_cast mc ON cm.id = mc.person_id
                WHERE cm.name LIKE ?
            """, (f'%{search}%',))
        else:
            cursor.execute("""
                SELECT COUNT(DISTINCT cm.id)
                FROM cast_members cm
                JOIN media_cast mc ON cm.id = mc.person_id
            """)
        total = cursor.fetchone()[0]
        
        # Get actors
        if search:
            cursor.execute("""
                SELECT cm.*, COUNT(mc.media_id) as media_count
                FROM cast_members cm
                JOIN media_cast mc ON cm.id = mc.person_id
                WHERE cm.name LIKE ?
                GROUP BY cm.id
                ORDER BY media_count DESC, cm.name ASC
                LIMIT ? OFFSET ?
            """, (f'%{search}%', limit, offset))
        else:
            cursor.execute("""
                SELECT cm.*, COUNT(mc.media_id) as media_count
                FROM cast_members cm
                JOIN media_cast mc ON cm.id = mc.person_id
                GROUP BY cm.id
                ORDER BY media_count DESC, cm.name ASC
                LIMIT ? OFFSET ?
            """, (limit, offset))
        
        actors = []
        for row in cursor.fetchall():
            actor = dict(row)
            if actor.get('profile_path'):
                # Use local cached URL
                actor['profile_url'] = _get_local_image_url(actor['profile_path'], 'w342')
                # Trigger background cache download
                _cache_image_async(actor['profile_path'], 'w342')
            actors.append(actor)
        
        return {
            'actors': actors,
            'total': total,
            'page': page,
            'limit': limit,
            'total_pages': (total + limit - 1) // limit
        }

def get_top_actors(limit: int = 10):
    """Get the most frequent actors in the library"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT cm.*, COUNT(mc.media_id) as media_count
            FROM cast_members cm
            JOIN media_cast mc ON cm.id = mc.person_id
            GROUP BY cm.id
            ORDER BY media_count DESC
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_cast_for_media(media_id: int, limit: int = 100):
    """Get cast members for a specific media item"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT cm.*, mc.character_name, mc.cast_order, mc.role, mc.department
            FROM cast_members cm
            JOIN media_cast mc ON cm.id = mc.person_id
            WHERE mc.media_id = ?
            ORDER BY mc.cast_order ASC
            LIMIT ?
        """, (media_id, limit))
        rows = cursor.fetchall()
        result = []
        for row in rows:
            actor = dict(row)
            if actor.get('profile_path'):
                actor['profile_url'] = _get_local_image_url(actor['profile_path'], 'w185')
                _cache_image_async(actor['profile_path'], 'w185')
                result.append(actor)
        return result

def save_cast_member(tmdb_person_id: int, name: str, profile_path: str = None, biography: str = None, birthday: str = None, deathday: str = None):
    """Save or update a cast member"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO cast_members (tmdb_person_id, name, profile_path, biography, birthday, deathday)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(tmdb_person_id) DO UPDATE SET
                name = excluded.name,
                profile_path = COALESCE(excluded.profile_path, cast_members.profile_path),
                biography = COALESCE(excluded.biography, cast_members.biography),
                birthday = COALESCE(excluded.birthday, cast_members.birthday),
                deathday = COALESCE(excluded.deathday, cast_members.deathday)
        """, (tmdb_person_id, name, profile_path, biography, birthday, deathday))
        conn.commit()
        
        # Get the ID (either new or existing)
        cursor.execute("SELECT id FROM cast_members WHERE tmdb_person_id = ?", (tmdb_person_id,))
        row = cursor.fetchone()
        return row['id'] if row else None

def link_cast_to_media(media_id: int, person_id: int, character_name: str = None, cast_order: int = 0, role: str = 'Actor', department: str = 'Acting'):
    """Link a cast member to a media item"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO media_cast (media_id, person_id, character_name, cast_order, role, department)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (media_id, person_id, character_name, cast_order, role, department))
        conn.commit()

def get_full_filmography_from_tmdb(tmdb_person_id: int) -> list:
    """Fetch full filmography from TMDb API"""
    data = tmdb_request(f'/person/{tmdb_person_id}/combined_credits')
    
    if not data:
        return []
    
    # Get library media for marking
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT tmdb_id, id, type FROM media WHERE tmdb_id IS NOT NULL")
        
        # Build library map - normalize types to TMDb format
        library_map = {}
        for row in cursor.fetchall():
            tmdb_id = row['tmdb_id']
            db_type = row['type']
            media_id = row['id']
            
            # Normalize database type to TMDb format
            # DB uses: movie, series, episode
            # TMDb uses: movie, tv
            if db_type in ('series', 'episode'):
                normalized_type = 'tv'
            else:
                normalized_type = 'movie'
            
            library_map[(tmdb_id, normalized_type)] = media_id
    
    filmography = []
    cast_credits = data.get('cast', [])
    seen_titles = set()  # Track unique titles to prevent duplicates
    
    for credit in cast_credits:
        media_type = credit.get('media_type', 'movie')
        tmdb_id = credit.get('id')
        poster_path = credit.get('poster_path')
        
        # Skip entries without poster - hide them
        if not poster_path:
            continue
        
        # Skip duplicates - use tmdb_id + media_type as unique key
        unique_key = (tmdb_id, media_type)
        if unique_key in seen_titles:
            continue
        seen_titles.add(unique_key)
        
        # Check if in library
        library_id = library_map.get((tmdb_id, media_type))
        
        p_path = credit.get('poster_path')
        filmography.append({
            'tmdb_id': tmdb_id,
            'title': credit.get('title') or credit.get('name', 'Unknown'),
            'original_title': credit.get('original_title') or credit.get('original_name'),
            'media_type': media_type,
            'character': credit.get('character'),
            'genre_ids': credit.get('genre_ids', []),
            'poster_path': p_path,
            'poster_url': _get_local_image_url(p_path, 'w342') if p_path else None,
            'year': (credit.get('release_date') or credit.get('first_air_date') or '')[:4],
            'vote_average': credit.get('vote_average'),
            'popularity': credit.get('popularity', 0),
            'in_library': library_id is not None,
            'library_id': library_id
        })
        # Cache poster image
        if p_path:
            _cache_image_async(p_path, 'w342')
    
    # Sort by popularity/year
    filmography.sort(key=lambda x: (-x.get('popularity', 0), -(int(x['year']) if x['year'] else 0)))
    
    # Cache the filmography data
    _cache_filmography_data(tmdb_person_id, filmography)
    
    return filmography

@cast_bp.route('/api/media/<int:media_id>/cast')
def api_get_media_cast(media_id):
    """Get cast members for a specific media item"""
    limit = request.args.get('limit', 100, type=int)
    cast = get_cast_for_media(media_id, limit)
    
    # AUTO-HEAL: If DB has outdated limit (e.g. 10) but we want more, fetch on the fly
    # Relaxed condition: if we have FEWER than requested, and requested > 10, try to fetch more.
    if len(cast) < limit and limit > 10:
        try:
            # Check if we have TMDB ID to fetch from
            media = get_media_by_id(media_id)
            if media and media.get('tmdb_id') and media.get('type') in ('movie', 'series'):
                print(f"Auto-healing cast for media {media_id} (found {len(cast)}, requested {limit})")
                from metadata import MetadataFetcher
                fetcher = MetadataFetcher()
                # Fetch full cast (limit 100)
                fetcher.fetch_and_save_cast(media_id, media['tmdb_id'], media['type'], limit=limit)
                # Re-query DB
                cast = get_cast_for_media(media_id, limit)
        except Exception as e:
            print(f"Auto-heal cast failed: {e}")

    return jsonify(cast)

@cast_bp.route('/api/cast/media/<int:media_id>/xray', methods=['GET'])
def api_get_media_xray(media_id):
    """Get X-Ray data (cast and soundtrack) for a specific media item"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404

    # Fetch cast from db
    cast = get_cast_for_media(media_id, limit=50)
    
    # If missing cast, attempt to fetch from TMDB
    if not cast and media.get('tmdb_id'):
        try:
            from metadata import MetadataFetcher
            fetcher = MetadataFetcher()
            fetcher.fetch_and_save_cast(media_id, media['tmdb_id'], media.get('type', 'movie'), limit=50)
            cast = get_cast_for_media(media_id, limit=50)
        except Exception as e:
            print(f"X-Ray fetch cast failed: {e}")

    # Format cast
    formatted_cast = []
    for c in cast:
        formatted_cast.append({
            'person_id': c.get('id'),
            'name': c.get('name'),
            'character_name': c.get('character_name'),
            'profile_path': c.get('profile_url') or c.get('profile_path')
        })

    # Return X-Ray data
    return jsonify({
        'title': media.get('title', ''),
        'cast': formatted_cast,
        'soundtrack': []  # Placeholder for future soundtrack data
    })

@cast_bp.route('/api/cast/all')
def api_get_all_actors():
    """Get all actors with pagination"""
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 24, type=int)
    search = request.args.get('search', None)
    
    result = get_all_actors(page, limit, search)
    return jsonify(result)

@cast_bp.route('/api/cast/<int:person_id>')
def api_get_cast_details(person_id):
    """Get details of a cast member including their filmography in the library"""
    person = get_person_by_id(person_id)
    
    if not person:
        return jsonify({'error': 'Cast member not found'}), 404
    
    filmography = get_person_filmography(person_id)
    
    # Format profile image URL (use local cache)
    if person.get('profile_path'):
        person['profile_url'] = _get_local_image_url(person['profile_path'], 'w500')
        _cache_image_async(person['profile_path'], 'w500')
    
    return jsonify({
        **person,
        'filmography': filmography,
        'filmography_count': len(filmography)
    })

@cast_bp.route('/api/cast/<int:person_id>/full-filmography')
def api_get_full_filmography(person_id):
    """Get full filmography from TMDb for a person (with local cache)"""
    person = get_person_by_id(person_id)
    
    if not person:
        return jsonify({'error': 'Cast member not found'}), 404
    
    tmdb_person_id = person.get('tmdb_person_id')
    if not tmdb_person_id:
        return jsonify({'error': 'No TMDb ID for this person'}), 400
    
    # Try cache first
    cached = _get_cached_filmography(tmdb_person_id)
    if cached is not None:
        library_count = sum(1 for f in cached if f.get('in_library'))
        return jsonify({
            'filmography': cached,
            'total_count': len(cached),
            'library_count': library_count,
            'cached': True
        })
    
    # Fetch from TMDb (will also cache)
    filmography = get_full_filmography_from_tmdb(tmdb_person_id)
    
    # Count library items
    library_count = sum(1 for f in filmography if f.get('in_library'))
    
    return jsonify({
        'filmography': filmography,
        'total_count': len(filmography),
        'library_count': library_count,
        'cached': False
    })

@cast_bp.route('/api/cast/top')
def api_get_top_cast():
    """Get the most frequent actors in the library"""
    limit = request.args.get('limit', 10, type=int)
    actors = get_top_actors(limit)
    
    # Format profile URLs (use local cache)
    for actor in actors:
        if actor.get('profile_path'):
            actor['profile_url'] = _get_local_image_url(actor['profile_path'], 'w185')
            _download_and_cache_image(actor['profile_path'], 'w185')
    
    return jsonify(actors)

@cast_bp.route('/api/cast/tmdb/<int:tmdb_person_id>')
def api_get_cast_by_tmdb(tmdb_person_id):
    """Get cast member by TMDB person ID"""
    person = get_person_by_tmdb_id(tmdb_person_id)
    
    if not person:
        return jsonify({'error': 'Cast member not found'}), 404
    
    filmography = get_person_filmography(person['id'])
    
    if person.get('profile_path'):
        person['profile_url'] = _get_local_image_url(person['profile_path'], 'w500')
        _cache_image_async(person['profile_path'], 'w500')
    
    return jsonify({
        **person,
        'filmography': filmography,
        'filmography_count': len(filmography)
    })

@cast_bp.route('/api/tmdb/details/<media_type>/<int:tmdb_id>')
def api_get_tmdb_details(media_type, tmdb_id):
    """Get details for a media item directly from TMDb (proxy)"""
    endpoint = f"/{media_type}/{tmdb_id}"
    params = {'append_to_response': 'credits,videos,recommendations,release_dates,content_ratings'}
    data = tmdb_request(endpoint, params)
    
    if not data:
        return jsonify({'error': 'Media not found on TMDb'}), 404

    # Extract certification
    certification = ''
    if media_type == 'movie':
        releases = data.get('release_dates', {}).get('results', [])
        for r in releases:
            if r['iso_3166_1'] == 'US':
                for rel in r['release_dates']:
                    if rel.get('certification'):
                        certification = rel['certification']
                        break
    else:
        ratings = data.get('content_ratings', {}).get('results', [])
        for r in ratings:
            if r['iso_3166_1'] == 'US':
                certification = r['rating']
                break

    # Extract trailer
    trailer = None
    videos = data.get('videos', {}).get('results', [])
    for v in videos:
        if v['site'] == 'YouTube' and v['type'] == 'Trailer':
            trailer = f"https://www.youtube.com/watch?v={v['key']}"
            break
            
    # Process cast
    cast = []
    for member in data.get('credits', {}).get('cast', [])[:10]:
        profile_path = member.get('profile_path')
        cast.append({
            'id': member.get('id'),
            'name': member.get('name'),
            'character': member.get('character'),
            'profile_path': profile_path,
            'profile_url': _get_local_image_url(profile_path, 'w185') if profile_path else None
        })
        # Trigger background cache for cast images
        if profile_path:
            _cache_image_async(profile_path, 'w185')

    # Format response
    result = {
        'tmdb_id': data.get('id'),
        'title': data.get('title') or data.get('name'),
        'original_title': data.get('original_title') or data.get('original_name'),
        'overview': data.get('overview'),
        'poster_path': data.get('poster_path'),
        'backdrop_path': data.get('backdrop_path'),
        'release_date': data.get('release_date') or data.get('first_air_date'),
        'vote_average': data.get('vote_average'),
        'runtime': data.get('runtime') or (data.get('episode_run_time') or [0])[0],
        'genres': data.get('genres', []),
        'certification': certification,
        'trailer_url': trailer,
        'cast': cast,
        'poster_url': _get_local_image_url(data.get('poster_path'), 'w500'),
        'backdrop_url': _get_local_image_url(data.get('backdrop_path'), 'original')
    }
    
    # Cache images
    if data.get('poster_path'):
        _cache_image_async(data['poster_path'], 'w500')
    if data.get('backdrop_path'):
        _cache_image_async(data['backdrop_path'], 'original')
        
    return jsonify(result)

@cast_bp.route('/api/cast/extract/<int:media_id>', methods=['POST'])
def api_extract_cast_for_media(media_id):
    """Extract and save cast for a specific media item"""
    from database import get_media_by_id
    from metadata import MetadataFetcher
    
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    tmdb_id = media.get('tmdb_id')
    if not tmdb_id:
        return jsonify({'error': 'No TMDb ID for this media'}), 400
    
    fetcher = MetadataFetcher()
    count = fetcher.fetch_and_save_cast(
        media_id=media_id,
        tmdb_id=tmdb_id,
        media_type=media.get('type', 'movie'),
        limit=15
    )
    
    return jsonify({
        'success': True,
        'media_id': media_id,
        'cast_saved': count
    })

@cast_bp.route('/api/cast/extract-all', methods=['GET', 'POST'])
def api_extract_cast_for_all():
    """Extract and save cast for all media items (background task)"""
    from database import get_connection
    from metadata import MetadataFetcher
    from threading import Thread
    
    def extract_all_cast():
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, tmdb_id, type FROM media 
                WHERE tmdb_id IS NOT NULL
            """)
            media_items = cursor.fetchall()
        
        fetcher = MetadataFetcher()
        for item in media_items:
            try:
                fetcher.fetch_and_save_cast(
                    media_id=item['id'],
                    tmdb_id=item['tmdb_id'],
                    media_type=item['type'],
                    limit=10
                )
            except Exception as e:
                print(f"Error extracting cast for {item['id']}: {e}")
    
    thread = Thread(target=extract_all_cast, daemon=True)
    thread.start()
    
    return jsonify({
        'success': True,
        'message': 'Cast extraction started in background'
    })

@cast_bp.route('/api/cast/cleanup-unused', methods=['GET', 'POST'])
def api_cleanup_unused_cast():
    """Remove cast members that are not linked to any media"""
    from database import get_connection
    
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Find cast members with no media links
        cursor.execute("""
            SELECT id, tmdb_person_id, name
            FROM cast_members
            WHERE id NOT IN (SELECT DISTINCT person_id FROM media_cast)
        """)
        unused_cast = cursor.fetchall()
        
        if not unused_cast:
            return jsonify({
                'success': True,
                'removed': 0,
                'message': 'No unused cast members found'
            })
        
        # Delete unused cast members
        cursor.execute("""
            DELETE FROM cast_members
            WHERE id NOT IN (SELECT DISTINCT person_id FROM media_cast)
        """)
        conn.commit()
        
        removed_count = len(unused_cast)
        print(f"✓ Removed {removed_count} unused cast members")
        
        return jsonify({
            'success': True,
            'removed': removed_count,
            'message': f'Removed {removed_count} unused cast members'
        })


# =============================================================================
# IMAGE CACHE SERVING
# =============================================================================

@cast_bp.route('/api/cast/image/<size>/<filename>')
def api_serve_cached_image(size, filename):
    """Serve a locally cached TMDb image"""
    import mimetypes
    local_path = os.path.join(IMAGE_CACHE_DIR, f"{size}_{filename}")
    
    if os.path.exists(local_path):
        # Check for valid file (not 0 bytes)
        if os.path.getsize(local_path) > 0:
            mime = mimetypes.guess_type(filename)[0] or 'image/jpeg'
            response = send_file(local_path, mimetype=mime)
            response.headers['Cache-Control'] = 'public, max-age=2592000'  # 30 days
            return response
        else:
            # Delete empty file and attempt re-download
            try:
                os.remove(local_path)
            except OSError:
                pass
    
    # Not cached yet - try to download
    # Reconstruct tmdb_path from filename
    tmdb_path = '/' + filename.replace('_', '/')
    cached_path = _download_and_cache_image(tmdb_path, size)
    
    if cached_path and os.path.exists(cached_path) and os.path.getsize(cached_path) > 0:
        mime = mimetypes.guess_type(filename)[0] or 'image/jpeg'
        response = send_file(cached_path, mimetype=mime)
        response.headers['Cache-Control'] = 'public, max-age=2592000'
        return response
    
    # Fallback: redirect to TMDb
    try:
        tmdb_url = f"https://image.tmdb.org/t/p/{size}{tmdb_path}"
        return Response(status=302, headers={'Location': tmdb_url})
    except Exception:
        return Response(status=404)


@cast_bp.route('/api/cast/cache/stats')
def api_cache_stats():
    """Get cache statistics"""
    image_count = 0
    image_size = 0
    data_count = 0
    data_size = 0
    
    for f in os.listdir(IMAGE_CACHE_DIR):
        path = os.path.join(IMAGE_CACHE_DIR, f)
        if os.path.isfile(path):
            image_count += 1
            image_size += os.path.getsize(path)
    
    for f in os.listdir(DATA_CACHE_DIR):
        path = os.path.join(DATA_CACHE_DIR, f)
        if os.path.isfile(path):
            data_count += 1
            data_size += os.path.getsize(path)
    
    return jsonify({
        'images': {'count': image_count, 'size_mb': round(image_size / 1024 / 1024, 2)},
        'data': {'count': data_count, 'size_mb': round(data_size / 1024 / 1024, 2)},
        'total_size_mb': round((image_size + data_size) / 1024 / 1024, 2)
    })


@cast_bp.route('/media/<int:media_id>/xray', methods=['GET'])
def get_media_xray(media_id):
    """Get X-Ray scene cast and soundtrack info for a media item"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404

    cast = []
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT cm.id as person_id, cm.name, mc.character_name, cm.profile_path
            FROM media_cast mc
            JOIN cast_members cm ON mc.person_id = cm.id
            WHERE mc.media_id = ?
            ORDER BY mc.cast_order ASC
            LIMIT 12
        """, (media_id,))
        rows = cursor.fetchall()
        for r in rows:
            profile_url = r['profile_path']
            if profile_url and not profile_url.startswith('http'):
                profile_url = f"https://image.tmdb.org/t/p/w185{profile_url}"
            cast.append({
                'person_id': r['person_id'],
                'name': r['name'],
                'character_name': r['character_name'] or 'ممثل',
                'profile_path': profile_url
            })

    soundtrack = []
    if media.get('genres'):
        soundtrack.append({'title': f"الموسيقى التصويرية والافتتاحية الرسمية", 'artist': media.get('title', '')})

    return jsonify({
        'title': media.get('title', ''),
        'cast': cast,
        'soundtrack': soundtrack
    })

