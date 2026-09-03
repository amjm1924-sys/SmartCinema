# HLS Transcoding Module for SmartCinema
# Real-time video transcoding to HLS format with adaptive bitrate

import os
import subprocess
import threading
import time
import hashlib
from pathlib import Path
from flask import Blueprint, jsonify, Response, send_file, request
from database import get_media_by_id, get_setting, set_setting

# Configuration
HLS_CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'hls_cache')
SEGMENT_DURATION = 4  # seconds
MAX_CONCURRENT_JOBS = 2

# Quality presets
QUALITY_PRESETS = {
    'copy': {'width': 1920, 'height': 1080, 'bitrate': '20000k', 'audio': '192k'},  # Direct stream
    '1080p': {'width': 1920, 'height': 1080, 'bitrate': '5000k', 'audio': '192k'},
    '720p': {'width': 1280, 'height': 720, 'bitrate': '2500k', 'audio': '128k'},
    '480p': {'width': 854, 'height': 480, 'bitrate': '1000k', 'audio': '96k'},
    '360p': {'width': 640, 'height': 360, 'bitrate': '500k', 'audio': '64k'},
}

# Active transcoding jobs
active_jobs = {}
job_lock = threading.Lock()


def get_cache_path(media_id: int, quality: str = None) -> str:
    """Get the cache directory path for a media item"""
    base = os.path.join(HLS_CACHE_DIR, str(media_id))
    if quality:
        return os.path.join(base, quality)
    return base


def get_master_playlist_path(media_id: int) -> str:
    """Get the master playlist path"""
    return os.path.join(get_cache_path(media_id), 'master.m3u8')


def is_transcoding(media_id: int) -> bool:
    """Check if a media is currently being transcoded"""
    with job_lock:
        return media_id in active_jobs


def generate_master_playlist(media_id: int, qualities: list) -> str:
    """Generate HLS master playlist with adaptive bitrate"""
    content = "#EXTM3U\n"
    content += "#EXT-X-VERSION:3\n\n"
    
    for quality in qualities:
        preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS['720p'])
        bandwidth = int(preset['bitrate'].replace('k', '')) * 1000
        resolution = f"{preset['width']}x{preset['height']}"
        
        content += f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={resolution}\n"
        content += f"{quality}/playlist.m3u8\n\n"
    
    return content


def start_transcode(media_id: int, file_path: str, quality: str = '720p', audio_track: int = 0) -> dict:
    """
    Start transcoding a video to HLS format.
    Returns status of the transcoding job.
    """
    cache_key = f"{media_id}_{quality}_{audio_track}"
    if is_transcoding(cache_key):
        return {'status': 'already_running', 'media_id': media_id}
    
    # Check concurrent job limit
    with job_lock:
        if len(active_jobs) >= MAX_CONCURRENT_JOBS:
            return {'status': 'queue_full', 'message': 'Too many concurrent jobs'}
    
    # Create cache directory
    output_dir = get_cache_path(media_id, f"{quality}_a{audio_track}")
    os.makedirs(output_dir, exist_ok=True)
    
    preset = QUALITY_PRESETS.get(quality, QUALITY_PRESETS['720p'])
    
    ffmpeg_cmd = [
        'ffmpeg', '-y',
        '-i', file_path,
        '-map', '0:v:0',
        '-map', f'0:a:{audio_track}'
    ]
    
    if quality == 'copy':
        # Direct stream without video transcode, use fmp4 for HEVC support in browsers
        from ffmpeg_utils import get_video_info
        info = get_video_info(file_path) or {}
        v_codec = info.get('video_codec', '').lower()
        
        ffmpeg_cmd.extend(['-c:v', 'copy'])
        
        is_hevc = 'hevc' in v_codec or 'h265' in v_codec
        if is_hevc:
            ffmpeg_cmd.extend(['-tag:v', 'hvc1'])
            ffmpeg_cmd.extend([
                '-c:a', 'aac',
                '-b:a', preset['audio'],
                '-hls_time', str(SEGMENT_DURATION),
                '-hls_list_size', '0',
                '-hls_segment_type', 'fmp4',
                '-hls_fmp4_init_filename', 'init.mp4',
                '-hls_segment_filename', 'segment_%03d.m4s',
                '-hls_flags', 'independent_segments',
                'playlist.m3u8'
            ])
        else:
            ffmpeg_cmd.extend([
                '-c:a', 'aac',
                '-b:a', preset['audio'],
                '-hls_time', str(SEGMENT_DURATION),
                '-hls_list_size', '0',
                '-hls_segment_filename', 'segment_%03d.ts',
                '-hls_flags', 'independent_segments',
                'playlist.m3u8'
            ])
    else:
        # Determine codec and options
        from transcode_utils import get_video_codec, get_transcode_options
        codec = get_video_codec()
        codec_options = get_transcode_options(codec)
        ffmpeg_cmd.extend(codec_options)
        
        ffmpeg_cmd.extend([
            '-b:v', preset['bitrate'],
            '-maxrate', preset['bitrate'],
            '-bufsize', f"{int(preset['bitrate'].replace('k', '')) * 2}k",
            '-vf', f"scale={preset['width']}:{preset['height']}:force_original_aspect_ratio=decrease",
            '-c:a', 'aac',
            '-b:a', preset['audio'],
            '-hls_time', str(SEGMENT_DURATION),
            '-hls_list_size', '0',
            '-hls_segment_filename', 'segment_%03d.ts',
            '-hls_flags', 'independent_segments',
            'playlist.m3u8'
        ])
    
    # Start transcoding in background thread
    def run_transcode():
        try:
            with job_lock:
                active_jobs[cache_key] = {'quality': quality, 'started': time.time(), 'status': 'running'}
            
            process = subprocess.Popen(
                ffmpeg_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=output_dir,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )
            
            _, stderr = process.communicate()
            
            with job_lock:
                if cache_key in active_jobs:
                    if process.returncode == 0:
                        active_jobs[cache_key]['status'] = 'completed'
                    else:
                        active_jobs[cache_key]['status'] = 'failed'
                        active_jobs[cache_key]['error'] = stderr.decode('utf-8', errors='ignore')[-500:]
                    del active_jobs[cache_key]
                    
        except Exception as e:
            with job_lock:
                if cache_key in active_jobs:
                    active_jobs[cache_key]['status'] = 'failed'
                    active_jobs[cache_key]['error'] = str(e)
                    del active_jobs[cache_key]
    
    thread = threading.Thread(target=run_transcode, daemon=True)
    thread.start()
    
    return {'status': 'started', 'media_id': media_id, 'quality': quality}


def check_hls_ready(media_id: int, quality: str = '720p') -> bool:
    """Check if HLS playlist is ready for streaming"""
    playlist_path = os.path.join(get_cache_path(media_id, quality), 'playlist.m3u8')
    return os.path.exists(playlist_path)


def cleanup_old_cache(max_age_hours: int = 24):
    """Remove cached HLS files older than max_age_hours"""
    if not os.path.exists(HLS_CACHE_DIR):
        return
    
    cutoff = time.time() - (max_age_hours * 3600)
    removed = 0
    
    for item in os.listdir(HLS_CACHE_DIR):
        item_path = os.path.join(HLS_CACHE_DIR, item)
        if os.path.isdir(item_path):
            mtime = os.path.getmtime(item_path)
            if mtime < cutoff:
                import shutil
                shutil.rmtree(item_path, ignore_errors=True)
                removed += 1
    
    return removed


# Flask Blueprint
hls_bp = Blueprint('hls', __name__, url_prefix='/api/stream')


@hls_bp.route('/<int:media_id>/start', methods=['POST'])
def api_start_transcode(media_id):
    """Start transcoding a media file"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    file_path = media.get('file_path')
    if not file_path or not os.path.exists(file_path):
        return jsonify({'error': 'Media file not found'}), 404
    
    quality = request.args.get('quality', '720p')
    result = start_transcode(media_id, file_path, quality)
    
    return jsonify(result)


@hls_bp.route('/<int:media_id>/master.m3u8')
def api_master_playlist(media_id):
    """Get master HLS playlist"""
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404
    
    # Determine available qualities based on source resolution
    source_height = media.get('height')
    if not source_height:
        # If height unknown, try to guess from quality tag or default to all
        quality_tag = media.get('quality', '').lower()
        if '1080' in quality_tag: source_height = 1080
        elif '720' in quality_tag: source_height = 720
        elif '480' in quality_tag: source_height = 480
        elif '360' in quality_tag: source_height = 360
        else: source_height = 1080 # Fallback 

    all_qualities = ['copy', '1080p', '720p', '480p', '360p']
    available_qualities = []
    
    for q in all_qualities:
        if q == 'copy':
            available_qualities.append(q)
            continue
        q_data = QUALITY_PRESETS[q]
        # Allow quality if it's lower or equal to source (with small buffer for loose crop)
        if q_data['height'] <= (source_height + 10): 
            available_qualities.append(q)
            
    if not available_qualities:
        available_qualities = ['480p'] # absolute fallback

    # Generate master playlist
    content = generate_master_playlist(media_id, available_qualities)
    
    return Response(content, mimetype='application/vnd.apple.mpegurl')


@hls_bp.route('/<int:media_id>/<quality>/playlist.m3u8')
def api_quality_playlist(media_id, quality):
    """Get quality-specific playlist"""
    if '_a' in quality and quality.rsplit('_a', 1)[1].isdigit():
        parts = quality.rsplit('_a', 1)
        base_quality = parts[0]
        audio_track = int(parts[1])
        folder_name = quality
    else:
        audio_track = request.args.get('audio_track', default=0, type=int)
        base_quality = quality
        folder_name = f"{quality}_a{audio_track}"

    playlist_path = os.path.join(get_cache_path(media_id, folder_name), 'playlist.m3u8')
    
    if not os.path.exists(playlist_path):
        # Start transcoding if not ready
        media = get_media_by_id(media_id)
        if media and media.get('file_path'):
            start_transcode(media_id, media['file_path'], base_quality, audio_track)
            
            # Wait for playlist to be generated (up to 5 seconds)
            start_time = time.time()
            while time.time() - start_time < 5.0:
                if os.path.exists(playlist_path):
                    break
                time.sleep(0.1)
                
            if os.path.exists(playlist_path):
                return send_file(playlist_path, mimetype='application/vnd.apple.mpegurl')
                
            return jsonify({'status': 'transcoding', 'retry_after': 5}), 202
        return jsonify({'error': 'Not found'}), 404
    
    return send_file(playlist_path, mimetype='application/vnd.apple.mpegurl')


@hls_bp.route('/<int:media_id>/<quality>/<segment>')
def api_segment(media_id, quality, segment):
    """Get HLS segment file"""
    if '_a' in quality and quality.rsplit('_a', 1)[1].isdigit():
        folder_name = quality
    else:
        audio_track = request.args.get('audio_track', default=0, type=int)
        folder_name = f"{quality}_a{audio_track}"

    segment_path = os.path.join(get_cache_path(media_id, folder_name), segment)
    
    if not os.path.exists(segment_path):
        return jsonify({'error': 'Segment not found'}), 404
    
    # Determine mimetype based on extension
    mimetype = 'video/iso.segment' if segment.endswith('.m4s') else 'video/MP2T'
    return send_file(segment_path, mimetype=mimetype)


@hls_bp.route('/<int:media_id>/status')
def api_transcode_status(media_id):
    """Get transcoding status"""
    with job_lock:
        if media_id in active_jobs:
            return jsonify(active_jobs[media_id])
    
    # Check if already cached
    if check_hls_ready(media_id):
        return jsonify({'status': 'ready'})
    
    return jsonify({'status': 'not_started'})


@hls_bp.route('/cleanup', methods=['POST'])
def api_cleanup_cache():
    """Cleanup old HLS cache"""
    hours = request.args.get('hours', 24, type=int)
    removed = cleanup_old_cache(hours)
    return jsonify({'removed': removed, 'hours': hours})
