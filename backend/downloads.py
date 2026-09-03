import os
import subprocess
import threading
import uuid
from flask import Blueprint, request, jsonify, send_file, current_app
from database import get_media_by_id
import logging

downloads_bp = Blueprint('downloads', __name__, url_prefix='/api/downloads')

# Store active download jobs: {job_id: {status: 'processing', progress: 0, file_path: ...}}
download_jobs = {}
DOWNLOAD_CACHE_DIR = os.path.join(os.getcwd(), 'static', 'downloads')
os.makedirs(DOWNLOAD_CACHE_DIR, exist_ok=True)

def remux_hls_to_mp4(hls_path, output_path, job_id):
    """Remuxes HLS playlist to MP4 using FFmpeg"""
    try:
        # Check if HLS exists
        if not os.path.exists(hls_path):
             download_jobs[job_id]['status'] = 'failed'
             download_jobs[job_id]['error'] = 'Source HLS not found'
             return

        cmd = [
            'ffmpeg', '-y',
            '-i', hls_path,
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            output_path
        ]
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Wait for completion (could parse stderr for progress but copy is fast)
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            download_jobs[job_id]['status'] = 'completed'
            download_jobs[job_id]['file_path'] = output_path
        else:
            download_jobs[job_id]['status'] = 'failed'
            download_jobs[job_id]['error'] = stderr.decode()
            
    except Exception as e:
        download_jobs[job_id]['status'] = 'failed'
        download_jobs[job_id]['error'] = str(e)

@downloads_bp.route('/<int:media_id>', methods=['POST'])
def start_download(media_id):
    media = get_media_by_id(media_id)
    if not media:
        return jsonify({'error': 'Media not found'}), 404

    # Determine source HLS path
    # Assuming standard HLS path structure from hls_transcoder.py
    # /static/hls/{media_id}/playlist.m3u8
    hls_dir = os.path.join(os.getcwd(), 'static', 'hls', str(media_id))
    hls_path = os.path.join(hls_dir, 'playlist.m3u8')
    
    # Target MP4 path
    output_filename = f"{media['title']}_{media_id}.mp4".replace(' ', '_') # Simple sanitization
    output_path = os.path.join(DOWNLOAD_CACHE_DIR, output_filename)
    
    # Check if already exists
    if os.path.exists(output_path):
        return jsonify({
            'status': 'completed',
            'download_url': f'/api/downloads/file/{output_filename}'
        })

    job_id = str(uuid.uuid4())
    download_jobs[job_id] = {
        'status': 'processing', 
        'media_id': media_id,
        'title': media['title']
    }
    
    threading.Thread(target=remux_hls_to_mp4, args=(hls_path, output_path, job_id)).start()
    
    return jsonify({
        'job_id': job_id,
        'status': 'processing'
    })

@downloads_bp.route('/status/<job_id>', methods=['GET'])
def get_status(job_id):
    job = download_jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
        
    response = {'status': job['status']}
    if job['status'] == 'completed':
        filename = os.path.basename(job['file_path'])
        response['download_url'] = f'/api/downloads/file/{filename}'
    elif job['status'] == 'failed':
        response['error'] = job.get('error')
        
    return jsonify(response)

@downloads_bp.route('/file/<path:filename>')
def download_file(filename):
    """Serve downloaded file"""
    return send_file(os.path.join(DOWNLOAD_CACHE_DIR, filename), as_attachment=True)
