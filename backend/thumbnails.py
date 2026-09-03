"""
Thumbnail Generator Module
Generates sprite sheets for video hover previews using FFmpeg
"""
import os
import subprocess
import hashlib

THUMBNAIL_DIR = 'data/thumbnails'
from ffmpeg_utils import get_ffmpeg_manager

THUMBNAIL_DIR = 'data/thumbnails'

def get_sprite_path(video_path):
    """Get the sprite sheet path for a video"""
    video_hash = hashlib.md5(video_path.encode()).hexdigest()
    return os.path.join(THUMBNAIL_DIR, f"{video_hash}_sprite.jpg")

def generate_sprite_sheet(video_path, output_path=None, cols=10, rows=10, thumb_width=160, thumb_height=90):
    """
    Generate a sprite sheet from video for hover previews
    
    Args:
        video_path: Path to the video file
        output_path: Where to save the sprite (auto-generated if None)
        cols: Number of columns in sprite
        rows: Number of rows in sprite
        thumb_width: Width of each thumbnail
        thumb_height: Height of each thumbnail
    
    Returns:
        Path to generated sprite or None if failed
    """
    os.makedirs(THUMBNAIL_DIR, exist_ok=True)
    
    # Get FFmpeg path dynamically
    ffmpeg_manager = get_ffmpeg_manager()
    ffmpeg_path = ffmpeg_manager.get_ffmpeg_path()
    
    if not ffmpeg_path:
        print("Error: FFmpeg not found, cannot generate thumbnails")
        return None
    
    if output_path is None:
        output_path = get_sprite_path(video_path)
    
    # If sprite already exists, skip
    if os.path.exists(output_path):
        return output_path
    
    total_thumbs = cols * rows  # 100 thumbnails
    
    # Get video duration
    try:
        result = subprocess.run([
            ffmpeg_path, '-i', video_path
        ], capture_output=True, text=True, timeout=30)
        
        # Parse duration from stderr
        duration_str = None
        for line in result.stderr.split('\n'):
            if 'Duration:' in line:
                duration_str = line.split('Duration:')[1].split(',')[0].strip()
                break
        
        if not duration_str:
            return None
        
        # Parse duration to seconds
        parts = duration_str.split(':')
        duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        
        # Calculate frame interval
        interval = duration / total_thumbs
        
        # Generate sprite using FFmpeg
        cmd = [
            ffmpeg_path,
            '-hwaccel', 'auto',
            '-i', video_path,
            '-vf', f'fps=1/{interval},scale={thumb_width}:{thumb_height},tile={cols}x{rows}',
            '-frames:v', '1',
            '-preset', 'ultrafast',
            '-y',
            output_path
        ]
        
        subprocess.run(cmd, capture_output=True, timeout=300)
        
        if os.path.exists(output_path):
            return output_path
        return None
        
    except Exception as e:
        print(f"Error generating sprite: {e}")
        return None

def register_thumbnail_routes(app):
    """Register thumbnail API routes"""
    from flask import jsonify, send_file, request
    
    @app.route('/api/thumbnails/sprite/<int:media_id>', methods=['GET'])
    def get_thumbnail_sprite(media_id):
        """Get or generate thumbnail sprite for a media"""
        from database import get_media_by_id
        
        media = get_media_by_id(media_id)
        if not media or not media.get('file_path'):
            return jsonify({'error': 'Media not found'}), 404
        
        video_path = media['file_path']
        sprite_path = generate_sprite_sheet(video_path)
        
        if sprite_path and os.path.exists(sprite_path):
            return send_file(sprite_path, mimetype='image/jpeg')
        
        return jsonify({'error': 'Failed to generate thumbnails'}), 500
    
    @app.route('/api/thumbnails/<int:media_id>/info', methods=['GET'])
    def get_thumbnail_info(media_id):
        """Get thumbnail sprite info (columns, rows, dimensions)"""
        from database import get_media_by_id
        
        media = get_media_by_id(media_id)
        if not media:
            return jsonify({'error': 'Media not found'}), 404
        
        sprite_path = get_sprite_path(media.get('file_path', ''))
        exists = os.path.exists(sprite_path)
        
        return jsonify({
            'available': exists,
            'cols': 10,
            'rows': 10,
            'thumb_width': 160,
            'thumb_height': 90,
            'total': 100
        })
