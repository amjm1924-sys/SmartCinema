# OpenSubtitles API Integration
# Auto-download subtitles for movies/series

import os
import json
import hashlib
import requests
from pathlib import Path
from database import get_connection, get_setting, set_setting

# OpenSubtitles REST API (v2023+)
OPENSUBTITLES_API_URL = "https://api.opensubtitles.com/api/v1"
OPENSUBTITLES_API_KEY = None  # Will be loaded from settings

# Default headers
def get_headers():
    """Get API headers with current API key"""
    api_key = get_setting('opensubtitles_api_key', '')
    return {
        'Api-Key': api_key,
        'Content-Type': 'application/json',
        'User-Agent': 'SmartCinema v1.0'
    }


def get_auth_token():
    """Get the stored auth token"""
    return get_setting('opensubtitles_token', '')


def login(username: str, password: str) -> dict:
    """Login to OpenSubtitles and get JWT token"""
    api_key = get_setting('opensubtitles_api_key', '')
    if not api_key:
        return {'success': False, 'error': 'API key not configured'}
    
    try:
        response = requests.post(
            f"{OPENSUBTITLES_API_URL}/login",
            headers=get_headers(),
            json={'username': username, 'password': password},
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token')
            if token:
                set_setting('opensubtitles_token', token)
                set_setting('opensubtitles_user', username)
                return {'success': True, 'user': data.get('user', {})}
        
        return {'success': False, 'error': response.json().get('message', 'Login failed')}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def search_subtitles(imdb_id: str = None, tmdb_id: int = None, query: str = None, 
                     languages: list = None, season: int = None, episode: int = None,
                     parent_imdb_id: str = None, parent_tmdb_id: int = None) -> list:
    """
    Search for subtitles on OpenSubtitles.
    Returns list of available subtitles.
    """
    if languages is None:
        # Get preferred languages from settings
        langs = get_setting('subtitle_languages', 'ar,en')
        languages = langs.split(',')
    
    params = {
        'languages': ','.join(languages)
    }
    
    if imdb_id:
        params['imdb_id'] = imdb_id.replace('tt', '')
    elif tmdb_id:
        params['tmdb_id'] = tmdb_id
    elif parent_imdb_id:
        params['parent_imdb_id'] = parent_imdb_id.replace('tt', '')
    elif parent_tmdb_id:
        params['parent_tmdb_id'] = parent_tmdb_id
    
    # If no IDs are available, fallback to query search.
    # Note: If we use query for episodes, we append SxxExx to help the API.
    if not (imdb_id or tmdb_id or parent_imdb_id or parent_tmdb_id) and query:
        if season is not None and episode is not None:
            params['query'] = f"{query} S{season:02d}E{episode:02d}"
        else:
            params['query'] = query
    
    if season is not None:
        params['season_number'] = season
    if episode is not None:
        params['episode_number'] = episode
    
    try:
        headers = get_headers()
        token = get_auth_token()
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        response = requests.get(
            f"{OPENSUBTITLES_API_URL}/subtitles",
            headers=headers,
            params=params,
            timeout=15
        )
        
        if response.status_code == 200:
            data = response.json()
            subtitles = []
            
            for item in data.get('data', []):
                attrs = item.get('attributes', {})
                files = attrs.get('files', [])
                
                if files:
                    subtitles.append({
                        'id': item.get('id'),
                        'file_id': files[0].get('file_id'),
                        'language': attrs.get('language'),
                        'release': attrs.get('release'),
                        'uploader': attrs.get('uploader', {}).get('name', 'Unknown'),
                        'downloads': attrs.get('download_count', 0),
                        'rating': attrs.get('ratings', 0),
                        'hearing_impaired': attrs.get('hearing_impaired', False),
                        'fps': attrs.get('fps'),
                        'filename': files[0].get('file_name', '')
                    })
            
            # Split by language
            ar_subs = sorted([s for s in subtitles if s['language'] == 'ar'], key=lambda x: x.get('downloads', 0), reverse=True)
            en_subs = sorted([s for s in subtitles if s['language'] == 'en'], key=lambda x: x.get('downloads', 0), reverse=True)
            other_subs = sorted([s for s in subtitles if s['language'] not in ['ar', 'en']], key=lambda x: x.get('downloads', 0), reverse=True)
            
            # Interleave Arabic and English (50/50 mix)
            balanced_subs = []
            max_len = max(len(ar_subs), len(en_subs))
            
            for i in range(max_len):
                if i < len(ar_subs):
                    balanced_subs.append(ar_subs[i])
                if i < len(en_subs):
                    balanced_subs.append(en_subs[i])
            
            # Append any others at the end
            balanced_subs.extend(other_subs)
            
            return balanced_subs
        else:
            print(f"OpenSubtitles search error: {response.status_code} - {response.text}")
            return []
            
    except Exception as e:
        print(f"OpenSubtitles search exception: {e}")
        return []


def download_subtitle(file_id: int, save_path: str) -> dict:
    """
    Download a subtitle file and save it locally.
    Returns the path to the saved subtitle.
    """
    try:
        headers = get_headers()
        token = get_auth_token()
        if token:
            headers['Authorization'] = f'Bearer {token}'
        
        # Step 1: Get download link
        response = requests.post(
            f"{OPENSUBTITLES_API_URL}/download",
            headers=headers,
            json={'file_id': file_id},
            timeout=15
        )
        
        if response.status_code != 200:
            return {'success': False, 'error': f'Failed to get download link: {response.text}'}
        
        download_data = response.json()
        download_url = download_data.get('link')
        
        if not download_url:
            return {'success': False, 'error': 'No download link received'}
        
        # Step 2: Download the file
        sub_response = requests.get(download_url, timeout=30)
        
        if sub_response.status_code != 200:
            return {'success': False, 'error': 'Failed to download subtitle file'}
        
        # Save the file
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        with open(save_path, 'wb') as f:
            f.write(sub_response.content)
        
        # Convert to VTT if SRT
        if save_path.lower().endswith('.srt'):
            vtt_path = save_path.rsplit('.', 1)[0] + '.vtt'
            if convert_srt_to_vtt(save_path, vtt_path):
                # Delete the original SRT if conversion succeeded
                try:
                    os.remove(save_path)
                    save_path = vtt_path
                except Exception as e:
                    print(f"Failed to delete original SRT: {e}")
        
        return {'success': True, 'path': save_path, 'remaining': download_data.get('remaining')}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def convert_srt_to_vtt(srt_path: str, vtt_path: str) -> bool:
    """Convert SRT subtitle to WebVTT format"""
    try:
        with open(srt_path, 'r', encoding='utf-8-sig') as f:
            srt_content = f.read()
        
        # Convert SRT timestamps to VTT format
        vtt_content = "WEBVTT\n\n"
        
        # Replace comma with period in timestamps
        import re
        srt_content = re.sub(r'(\d{2}:\d{2}:\d{2}),(\d{3})', r'\1.\2', srt_content)
        
        vtt_content += srt_content
        
        with open(vtt_path, 'w', encoding='utf-8') as f:
            f.write(vtt_content)
            
        return True
    except Exception as e:
        print(f"SRT to VTT conversion error: {e}")
        return False


def auto_download_arabic_subtitle(media_id: int) -> dict:
    """
    Attempt to auto-download Arabic subtitle for a given media_id.
    """
    from database import get_media_by_id
    
    media = get_media_by_id(media_id)
    if not media:
        return {'success': False, 'error': 'Media not found'}
    
    # Check if subtitle already exists
    video_path = media.get('file_path')
    if video_path:
        video_dir = os.path.dirname(video_path)
        video_name = os.path.splitext(os.path.basename(video_path))[0]
        
        # Check standard Arabic subtitle paths
        ar_paths = [
            os.path.join(video_dir, f"{video_name}.ar.srt"),
            os.path.join(video_dir, f"{video_name}.ara.srt"),
            os.path.join(video_dir, f"{video_name}.ar.vtt")
        ]
        if any(os.path.exists(p) for p in ar_paths):
            return {'success': True, 'message': 'Subtitle already exists'}
    
    # Needs to fetch via API
    imdb_id = media.get('imdb_id')
    tmdb_id = media.get('tmdb_id')
    title = media.get('title')
    season = media.get('season_number')
    episode = media.get('episode_number')
    
    parent_imdb_id = None
    parent_tmdb_id = None

    if media.get('type') == 'episode' and media.get('series_id'):
        from database import get_media_by_id
        series = get_media_by_id(media.get('series_id'))
        if series:
            parent_imdb_id = series.get('imdb_id')
            parent_tmdb_id = series.get('tmdb_id')
            if not imdb_id and not tmdb_id:
                title = series.get('title')
                
    subtitles = search_subtitles(
        imdb_id=imdb_id, 
        tmdb_id=tmdb_id, 
        query=title, 
        season=season, 
        episode=episode, 
        languages=['ar', 'ara'],
        parent_imdb_id=parent_imdb_id,
        parent_tmdb_id=parent_tmdb_id
    )
    
    # Get highest downloaded Arabic sub
    ar_subs = [s for s in subtitles if s.get('language') in ('ar', 'ara')]
    if not ar_subs:
        return {'success': False, 'error': 'No Arabic subtitles found'}
        
    ar_subs.sort(key=lambda x: x.get('downloads', 0), reverse=True)
    best_sub = ar_subs[0]
    
    if video_path:
        save_path = os.path.join(video_dir, f"{video_name}.ar.srt")
    else:
        save_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'subtitles', f"{media_id}_ar.srt")
        
    return download_subtitle(best_sub['file_id'], save_path)



def get_settings() -> dict:
    """Get OpenSubtitles settings"""
    return {
        'api_key': get_setting('opensubtitles_api_key', ''),
        'username': get_setting('opensubtitles_user', ''),
        'has_token': bool(get_auth_token()),
        'languages': get_setting('subtitle_languages', 'ar,en'),
        'auto_download': get_setting('subtitle_auto_download', '0') == '1'
    }


def save_settings(api_key: str = None, languages: str = None, auto_download: bool = None):
    """Save OpenSubtitles settings"""
    if api_key is not None:
        set_setting('opensubtitles_api_key', api_key)
    if languages is not None:
        set_setting('subtitle_languages', languages)
    if auto_download is not None:
        set_setting('subtitle_auto_download', '1' if auto_download else '0')


# Flask Blueprint for API endpoints
from flask import Blueprint, jsonify, request as flask_request

opensubtitles_bp = Blueprint('opensubtitles', __name__, url_prefix='/api/opensubtitles')


@opensubtitles_bp.route('/settings', methods=['GET'])
def api_get_settings():
    """Get OpenSubtitles configuration"""
    settings = get_settings()
    # Don't expose full API key
    if settings['api_key']:
        settings['api_key'] = settings['api_key'][:8] + '...'
    return jsonify(settings)


@opensubtitles_bp.route('/settings', methods=['PUT'])
def api_save_settings():
    """Save OpenSubtitles configuration"""
    data = flask_request.json
    save_settings(
        api_key=data.get('api_key'),
        languages=data.get('languages'),
        auto_download=data.get('auto_download')
    )
    return jsonify({'success': True})


@opensubtitles_bp.route('/login', methods=['POST'])
def api_login():
    """Login to OpenSubtitles"""
    data = flask_request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400
    
    result = login(username, password)
    return jsonify(result)


@opensubtitles_bp.route('/search/<int:media_id>', methods=['GET'])
def api_search_subtitles(media_id):
    """Search subtitles for a specific media"""
    from database import get_media_by_id
    
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    # Get search parameters
    imdb_id = media.get('imdb_id')
    tmdb_id = media.get('tmdb_id')
    title = media.get('title')
    season = media.get('season_number')
    episode = media.get('episode_number')

    parent_imdb_id = None
    parent_tmdb_id = None

    if media.get('type') == 'episode' and media.get('series_id'):
        series = get_media_by_id(media.get('series_id'))
        if series:
            # For episodes, we use the series ID as parent ID
            parent_imdb_id = series.get('imdb_id')
            parent_tmdb_id = series.get('tmdb_id')
            
            # If the episode itself doesn't have a specific title, use the series title for fallback query
            if not imdb_id and not tmdb_id:
                title = series.get('title')
    
    # Custom language override
    languages = flask_request.args.get('languages')
    if languages:
        languages = languages.split(',')
    
    # Search
    subtitles = search_subtitles(
        imdb_id=imdb_id, 
        tmdb_id=tmdb_id, 
        query=title, 
        season=season, 
        episode=episode, 
        languages=languages,
        parent_imdb_id=parent_imdb_id,
        parent_tmdb_id=parent_tmdb_id
    )
    
    return jsonify({'subtitles': subtitles, 'media_id': media_id})


@opensubtitles_bp.route('/download', methods=['POST'])
def api_download_subtitle():
    """Download and save a subtitle"""
    from database import get_media_by_id
    
    data = flask_request.json
    file_id = data.get('file_id')
    media_id = data.get('media_id')
    language = data.get('language', 'en')
    
    if not file_id or not media_id:
        return jsonify({'error': 'file_id and media_id required'}), 400
    
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    # Determine save path - next to video file
    video_path = media.get('file_path')
    if video_path:
        video_dir = os.path.dirname(video_path)
        video_name = os.path.splitext(os.path.basename(video_path))[0]
        save_path = os.path.join(video_dir, f"{video_name}.{language}.srt")
    else:
        # Fallback to data/subtitles
        save_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'subtitles', f"{media_id}_{language}.srt")
    
    result = download_subtitle(file_id, save_path)
    return jsonify(result)
