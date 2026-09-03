# Trailer Caching Module for SmartCinema
# Downloads and caches trailers locally using yt-dlp

import os
import subprocess
import json
import re
import time
from pathlib import Path
from flask import Blueprint, jsonify, send_file, request
from threading import Thread
from queue import Queue
from database import get_media_by_id, get_connection
from metadata import MetadataFetcher

trailers_bp = Blueprint('trailers', __name__)

# Trailer cache directory
TRAILER_DIR = Path(__file__).parent.parent / 'data' / 'trailers'
TRAILER_DIR.mkdir(parents=True, exist_ok=True)

# Download Queue
download_queue = Queue()
is_worker_running = False

# Track download status
download_status = {}

def update_trailer_status(media_id: int, status: str, error: str = None, progress: int = 0):
    """Update the global download status for a media item"""
    global download_status
    # Preserve existing entry if updating only status/error
    current = download_status.get(media_id, {})
    
    entry = {
        'status': status,
        'progress': progress if progress > 0 else current.get('progress', 0),
        'error': error,
        'updated_at': time.time()
    }
    
    download_status[media_id] = entry


def get_trailer_path(media_id: int) -> Path:
    """Get the local path for a cached trailer"""
    return TRAILER_DIR / f"{media_id}.mp4"

def extract_youtube_id(url: str) -> str | None:
    """Extract YouTube video ID from URL"""
    if not url:
        return None
    patterns = [
        r'(?:v=|/v/|youtu\.be/)([a-zA-Z0-9_-]{11})',
        r'(?:embed/)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, re.sub(r'\\/', '/', url)) # Fix escaped slashes
        if match:
            return match.group(1)
    return None

def process_download_queue():
    """Worker thread to process the download queue"""
    global is_worker_running
    is_worker_running = True
    
    print("Trailer Download Worker Started")
    
    while True:
        try:
            task = download_queue.get()
            if task is None:
                break
            
            media_id, youtube_url = task
            download_trailer_sync(media_id, youtube_url)
            download_queue.task_done()
            
            # Small delay to be nice to YouTube
            time.sleep(2)
            
        except Exception as e:
            print(f"Error in trailer worker: {e}")
    
    is_worker_running = False
    print("Trailer Download Worker Stopped")

def ensure_worker_running():
    global is_worker_running
    if not is_worker_running:
        t = Thread(target=process_download_queue, daemon=True)
        t.start()

def download_trailer_sync(media_id: int, youtube_url: str, retry_refresh: bool = True) -> bool:
    """Download a trailer from YouTube using yt-dlp (Synchronous)
    
    Args:
        media_id: ID of the media item
        youtube_url: The YouTube URL to download
        retry_refresh: If True, will attempt to fetch a fresh URL from TMDB on failure
    """
    global download_status
    
    output_path = get_trailer_path(media_id)
    
    # Update status
    download_status[media_id] = {
        'status': 'downloading',
        'progress': 0,
        'error': None
    }

    # Browser priority list to try
    browsers_to_try = ['chrome', 'edge', 'firefox']
    
    last_error = None

    try:
        # Check if URL is valid
        if not extract_youtube_id(youtube_url) and 'youtube.com' not in youtube_url:
             download_status[media_id] = {
                'status': 'failed',
                'progress': 0,
                'error': 'Invalid YouTube URL'
             }
             return False

        # Try each browser until one works or all fail
        for browser in browsers_to_try:
            print(f"[{media_id}] Attempting download with browser: {browser}")
            
            cmd = [
                'yt-dlp',
                '-f', 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[ext=mp4]',
                '-o', str(output_path),
                '--no-playlist',
                '--no-warnings',
                '--force-overwrites',
                '--cookies-from-browser', browser, 
                youtube_url
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            
            # Check success (return code 0 and file exists)
            if result.returncode == 0 and output_path.exists():
                # Success!
                relative_path = str(output_path.relative_to(Path(__file__).parent.parent))
                with get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        "UPDATE media SET trailer_local = ? WHERE id = ?",
                        (relative_path, media_id)
                    )
                    conn.commit()
                
                download_status[media_id] = {
                    'status': 'completed',
                    'progress': 100,
                    'error': None,
                    'path': relative_path
                }
                return True
            
            # If not success, check if it was a cookie/auth error
            err = result.stderr or ''
        if not youtube_url:
            update_trailer_status(media_id, 'failed', "No URL provided")
            return False

        # Extract YouTube ID
        youtube_id = extract_youtube_id(youtube_url)
        if not youtube_id:
            update_trailer_status(media_id, 'failed', "Invalid YouTube URL")
            return False
            
        # Target filename
        filename = f"trailer_{media_id}.mp4"
        output_path = TRAILER_DIR / filename
        
        # Check if already exists
        if output_path.exists() and output_path.stat().st_size > 0:
            update_trailer_status(media_id, 'completed', "Already exists")
            return True
        
        # Temp path
        temp_path = TRAILER_DIR / f"temp_{media_id}.mp4"
        
        # Cookie files
        cookie_files = [
            Path(__file__).parent.parent / 'data' / 'cookies.txt',
            Path(__file__).parent.parent / 'data' / 'cookies/cookies.txt'
        ]
        cookie_file = next((p for p in cookie_files if p.exists()), None)

        update_trailer_status(media_id, 'downloading')
        
        cmd_base = [
            'yt-dlp',
            '-f', 'bv*[height<=1080]+ba/b[height<=1080] / best[height<=1080]', # Max 1080p
            '-o', str(temp_path),
            '--no-playlist',
            '--quiet',
            '--no-warnings'
        ]
        
        if cookie_file:
            cmd_base.extend(['--cookies', str(cookie_file)])
            
        success = False
        last_error = ""

        # Strategy:
        # 1. Try provided URL with cookies (Chrome, Edge, Firefox)
        # 2. If blocked/avail, search TMDB for ALTERNATIVE
        # 3. If alternative found, try that
        # 4. If all fail, mark as geo_blocked

        browsers = ['chrome', 'edge', 'firefox'] if not cookie_file else []
        
        # Attempt 1: Browser Cookies
        for browser in browsers:
            print(f"[{media_id}] Attempting download with browser: {browser}")
            cmd = cmd_base + ['--cookies-from-browser', browser]
            # Add target URL
            cmd.append(youtube_url)
            
            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True)
                success = True
                break
            except subprocess.CalledProcessError as e:
                # Store error for analysis
                last_error = e.stderr or str(e)
                print(f"[{media_id}] Failed with {browser}: {last_error.strip().splitlines()[-1] if last_error else 'Unknown error'}")
        
        # Attempt 2: Explicit Cookie File (if exits) or No Cookies
        if not success:
            print(f"[{media_id}] All cookie attempts failed. Trying standard/file...")
            cmd = cmd_base + [youtube_url]
            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True)
                success = True
            except subprocess.CalledProcessError as e:
                last_error = e.stderr or str(e)
                print(f"Download failed for {media_id}: {last_error.strip().splitlines()[-1] if last_error else 'Unknown error'}")

        # Check for broken link
        broken_link_markers = [
            "Video unavailable", 
            "This video is not available", 
            "Private video", 
            "This video has been removed",
            "Sign in to confirm your age"
        ]
        is_broken_link = any(marker in last_error for marker in broken_link_markers)
        
        # SELF-HEALING / FALLBACK LOGIC
        if not success and is_broken_link and retry_refresh:
            print(f"[{media_id}] Detected broken/blocked link. Searching for alternative...")
            
            from metadata import MetadataFetcher
            from database import get_media_by_id, update_media_metadata
            
            # Get current media to find TMDB ID
            media = get_media_by_id(media_id)
            if media and media.get('tmdb_id'):
                fetcher = MetadataFetcher()
                tmdb_id = media['tmdb_id']
                m_type = media['type']
                
                # Search for ANY valid video (Teaser, Clip, etc.)
                new_url = fetcher.find_alternative_trailer(tmdb_id, m_type, blocked_id=youtube_id)
                
                if new_url and new_url != youtube_url:
                    print(f"[{media_id}] Found alternative: {new_url}. Retrying download...")
                    
                    # Update DB
                    update_media_metadata(media_id, {'trailer_url': new_url, 'trailer_health': 'healed'})
                    
                    # Recursive retry (False to prevent infinite loop)
                    return download_trailer_sync(media_id, new_url, retry_refresh=False)
                else:
                    print(f"[{media_id}] No alternative found or same URL returned.")
                    # Mark as permanently blocked to stop retrying
                    update_media_metadata(media_id, {'trailer_health': 'geo_blocked'})

        if success and temp_path.exists():
            # Move temp to final
            if output_path.exists():
                output_path.unlink()
            temp_path.rename(output_path)
            
            # Update DB
            from database import update_media_metadata
            rel_path = f"trailers/{filename}"
            update_media_metadata(media_id, {'trailer_local': rel_path, 'trailer_health': 'ok'})
            
            update_trailer_status(media_id, 'completed', rel_path)
            return True
        else:
            update_trailer_status(media_id, 'failed', "Download failed after retries")
            if temp_path.exists():
                temp_path.unlink()
            return False

    except Exception as e:
        print(f"Exception downloading trailer {media_id}: {e}")
        update_trailer_status(media_id, 'failed', str(e))
        return False

@trailers_bp.route('/api/trailers/<int:media_id>')
def serve_trailer(media_id):
    """Serve a cached trailer file"""
    trailer_path = get_trailer_path(media_id)
    
    if not trailer_path.exists():
        # Check database for alternative path
        media = get_media_by_id(media_id)
        if media and media.get('trailer_local'):
            # Handle both absolute and relative paths
            db_path_str = media['trailer_local']
            alt_path = Path(db_path_str)
            
            if not alt_path.is_absolute():
                alt_path = Path(__file__).parent.parent / db_path_str
                
            if alt_path.exists():
                return send_file(alt_path, mimetype='video/mp4')
        
        return jsonify({'error': 'Trailer not cached'}), 404
    
    return send_file(trailer_path, mimetype='video/mp4')

@trailers_bp.route('/api/trailers/<int:media_id>/status')
def trailer_status(media_id):
    """Check if a trailer is cached and get download status"""
    trailer_path = get_trailer_path(media_id)
    
    # Check if already cached
    if trailer_path.exists():
        return jsonify({
            'cached': True,
            'status': 'completed',
            'url': f'/api/trailers/{media_id}'
        })
    
    # Check database
    media = get_media_by_id(media_id)
    if media and media.get('trailer_local'):
        db_path_str = media['trailer_local']
        alt_path = Path(db_path_str)
        if not alt_path.is_absolute():
             alt_path = Path(__file__).parent.parent / db_path_str

        if alt_path.exists():
            return jsonify({
                'cached': True,
                'status': 'completed',
                'url': f'/api/trailers/{media_id}'
            })
    
    # Check download status
    if media_id in download_status:
        return jsonify({
            'cached': False,
            **download_status[media_id]
        })
    
    # Check if trailer URL exists
    has_trailer = media and media.get('trailer_url')
    
    return jsonify({
        'cached': False,
        'status': 'not_started',
        'has_trailer_url': bool(has_trailer)
    })

@trailers_bp.route('/api/trailers/<int:media_id>/cache', methods=['POST'])
def cache_trailer(media_id):
    """Start downloading a trailer"""
    media = get_media_by_id(media_id)
    
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    trailer_url = media.get('trailer_url')
    if not trailer_url:
        return jsonify({'error': 'No trailer URL available'}), 400
    
    # Check if already cached
    if get_trailer_path(media_id).exists():
        return jsonify({'message': 'Already cached', 'url': f'/api/trailers/{media_id}'})
    
    # Check if already downloading (in queue or status)
    if media_id in download_status and download_status[media_id].get('status') == 'downloading':
        return jsonify({'message': 'Download in progress'})
    
    # Add to queue
    ensure_worker_running()
    download_queue.put((media_id, trailer_url))
    
    download_status[media_id] = {'status': 'queued', 'progress': 0}
    
    return jsonify({'message': 'Download queued', 'status': 'queued'})

@trailers_bp.route('/api/trailers/batch-cache', methods=['POST'])
def batch_cache_trailers():
    """Start downloading trailers for multiple media items"""
    data = request.json or {}
    media_ids = data.get('media_ids', [])
    
    # Optional: If no IDs provided, fetch ALL media with trailers that aren't cached
    if not media_ids and data.get('all') == True:
        with get_connection() as conn:
            conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
            cursor = conn.cursor()
            # Select media that has a trailer_url but NO trailer_local (or file missing)
            # Simplified: Just get all with trailer_url
            cursor.execute("SELECT id, trailer_url FROM media WHERE trailer_url IS NOT NULL AND trailer_url != ''")
            items = cursor.fetchall()
            
            # Filter those already on disk
            media_ids = [item['id'] for item in items if not get_trailer_path(item['id']).exists()]
    
    if not media_ids:
        return jsonify({'error': 'No media IDs provided or found'}), 400
    
    started = []
    skipped = []
    
    ensure_worker_running()
    
    count = 0
    for media_id in media_ids:
        # Avoid dupes in queue
        if media_id in download_status and download_status[media_id].get('status') in ['downloading', 'queued']:
             skipped.append({'id': media_id, 'reason': 'Already queued'})
             continue
             
        # Re-check existence
        if get_trailer_path(media_id).exists():
            skipped.append({'id': media_id, 'reason': 'Already cached'})
            continue
            
        # Need to fetch URL if not passed (optimization: fetch in bulk above if 'all')
        if data.get('all') == True:
            # We already checked existence. We need the URL.
            # Reuse the items list from above if possible, but optimizing for "passed IDs" case:
            pass
            
        # Get Media URL
        media = get_media_by_id(media_id)
        if not media or not media.get('trailer_url'):
            skipped.append({'id': media_id, 'reason': 'No trailer URL'})
            continue

        download_queue.put((media_id, media['trailer_url']))
        download_status[media_id] = {'status': 'queued', 'progress': 0}
        started.append(media_id)
        count += 1
    
    return jsonify({
        'message': f'Queued {len(started)} downloads',
        'queued_count': len(started),
        'total_processed': len(media_ids),
        'started': started,
        'skipped_count': len(skipped)
    })

