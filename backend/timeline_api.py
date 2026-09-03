
# =============================================================================
# Timeline Thumbnails API
# =============================================================================

import threading
from timeline_thumbs import get_timeline_thumbnails

# Per-media lock set: prevents duplicate concurrent thumbnail generation
# (Logs showed 2x identical 112-second FFmpeg processes running in parallel for same media ID)
_thumbnail_locks: dict = {}
_thumbnail_locks_mutex = threading.Lock()

def _get_thumb_lock(media_id: int) -> threading.Lock:
    with _thumbnail_locks_mutex:
        if media_id not in _thumbnail_locks:
            _thumbnail_locks[media_id] = threading.Lock()
        return _thumbnail_locks[media_id]

@app.route('/api/thumbnails/generate/<int:media_id>', methods=['POST'])
def api_generate_timeline_thumbs(media_id):
    """Generate timeline thumbnails for a video — deduplicated per media_id"""
    lock = _get_thumb_lock(media_id)

    # If another request is already generating for this media, wait and return existing
    if not lock.acquire(blocking=True, timeout=180):
        # Timeout after 3 minutes — return whatever thumbnails exist
        thumbs = get_timeline_thumbnails()
        existing = thumbs.get_all_thumbnails(media_id)
        return jsonify({'thumbnails': existing, 'cached': True})

    try:
        media = get_media_by_id(media_id)
        if not media:
            return jsonify({'error': 'Media not found'}), 404

        video_path = media.get('file_path')
        duration = media.get('duration', 0)

        if not video_path or not duration:
            return jsonify({'error': 'Invalid media'}), 400

        interval = request.json.get('interval', 10) if request.json else 10

        thumbs = get_timeline_thumbnails()

        # If thumbnails already exist for this media, return them immediately (no FFmpeg needed)
        existing = thumbs.get_all_thumbnails(media_id)
        if existing:
            return jsonify({'thumbnails': existing, 'cached': True})

        result = thumbs.generate_thumbnails(media_id, video_path, duration, interval)
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        lock.release()

@app.route('/api/thumbnails/<int:media_id>', methods=['GET'])
def api_get_timeline_thumbs(media_id):
    """Get all timeline thumbnails for a media"""
    thumbs = get_timeline_thumbnails()
    thumbnails = thumbs.get_all_thumbnails(media_id)
    return jsonify(thumbnails)

@app.route('/api/thumbnails/<int:media_id>/<filename>', methods=['GET'])
def api_serve_thumbnail(media_id, filename):
    """Serve a thumbnail image"""
    from pathlib import Path
    thumb_dir = Path(__file__).parent.parent / 'data' / 'thumbnails' / str(media_id)
    return send_from_directory(thumb_dir, filename)
