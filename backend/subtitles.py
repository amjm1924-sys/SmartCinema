"""
Subtitle Support Module
Handles subtitle upload, storage, and auto-translation
"""
import os
import re
from flask import jsonify, request, send_file

SUBTITLE_DIR = 'data/subtitles'

def ensure_subtitle_dir():
    os.makedirs(SUBTITLE_DIR, exist_ok=True)

def get_subtitle_path(media_id, lang='en'):
    """Get path for a subtitle file"""
    return os.path.join(SUBTITLE_DIR, f"{media_id}_{lang}.vtt")

def srt_to_vtt(srt_content):
    """Convert SRT format to WebVTT format"""
    # Add WEBVTT header
    vtt = "WEBVTT\n\n"
    
    # Replace comma with dot in timestamps
    content = srt_content.replace(',', '.')
    
    # Remove sequence numbers and empty lines cleanup
    lines = content.strip().split('\n')
    result = []
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Skip sequence numbers
        if line.isdigit():
            i += 1
            continue
        
        # Timestamp line
        if '-->' in line:
            result.append(line)
            i += 1
            continue
        
        # Text lines
        if line:
            result.append(line)
        else:
            result.append('')
        
        i += 1
    
    return vtt + '\n'.join(result)

def register_subtitle_routes(app):
    """Register subtitle API routes"""
    
    @app.route('/api/media/<int:media_id>/subtitles/list', methods=['GET'])
    def api_get_subtitle_list(media_id):
        """Get available subtitles for a media - checks both uploaded and local files"""
        from database import get_media_by_id
        from pathlib import Path
        
        ensure_subtitle_dir()
        subtitles = []
        seen_keys = set()  # Prevent duplicates
        
        # 1. Check UPLOADED subtitles in data/subtitles/
        if os.path.exists(SUBTITLE_DIR):
            for file in os.listdir(SUBTITLE_DIR):
                if file.startswith(f"{media_id}_"):
                    lang = file.split('_')[1].replace('.vtt', '')
                    key = f"uploaded_{lang}"
                    if key not in seen_keys:
                        subtitles.append({
                            'lang': lang,
                            'label': 'العربية' if lang == 'ar' else 'English' if lang == 'en' else lang,
                            'url': f'/api/media/{media_id}/subtitles/file/{lang}'
                        })
                        seen_keys.add(key)
        
        # 2. Check LOCAL subtitles next to video file
        media = get_media_by_id(media_id)
        if media and media.get('file_path'):
            video_path = Path(media['file_path'])
            if video_path.parent.exists():
                SUBTITLE_EXTENSIONS = {'.srt', '.vtt', '.ass', '.ssa', '.sub'}
                video_stem = video_path.stem.lower()
                
                for sub_file in video_path.parent.iterdir():
                    if sub_file.suffix.lower() in SUBTITLE_EXTENSIONS:
                        # Check if subtitle matches video name
                        if video_stem in sub_file.stem.lower():
                            sub_stem = sub_file.stem.lower()
                            
                            # Detect language from filename
                            if 'arabic' in sub_stem or '.ar.' in sub_stem or sub_stem.endswith('.ar'):
                                lang = 'ar'
                                label = 'العربية'
                            elif 'english' in sub_stem or '.en.' in sub_stem or sub_stem.endswith('.en'):
                                lang = 'en'
                                label = 'English'
                            else:
                                lang = 'und'  # undetermined
                                label = sub_file.stem
                            
                            key = f"local_{str(sub_file)}"
                            if key not in seen_keys:
                                from urllib.parse import quote
                                encoded_path = quote(str(sub_file), safe='')
                                subtitles.append({
                                    'lang': lang,
                                    'label': label,
                                    'path': str(sub_file),  # Full path for serving
                                    'url': f'/api/subtitle/file?path={encoded_path}'
                                })
                                seen_keys.add(key)
        
        return jsonify({'subtitles': subtitles})
    
    @app.route('/api/media/<int:media_id>/subtitles/file/<lang>', methods=['GET'])
    def api_get_subtitle_file(media_id, lang):
        """Get a specific subtitle file"""
        path = get_subtitle_path(media_id, lang)
        
        if os.path.exists(path):
            return send_file(path, mimetype='text/vtt')
        
        return jsonify({'error': 'Subtitle not found'}), 404
    
    @app.route('/api/media/<int:media_id>/subtitles/upload', methods=['POST'])
    def api_upload_subtitle(media_id):
        """Upload a subtitle file"""
        ensure_subtitle_dir()
        
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        lang = request.form.get('lang', 'en')
        
        # Read content
        content = file.read().decode('utf-8', errors='replace')
        
        # Convert SRT to VTT if needed
        if file.filename.endswith('.srt'):
            content = srt_to_vtt(content)
        elif not file.filename.endswith('.vtt'):
            # Try to detect and convert
            if 'WEBVTT' not in content[:20]:
                content = srt_to_vtt(content)
        
        # Save as VTT
        output_path = get_subtitle_path(media_id, lang)
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return jsonify({
            'success': True,
            'message': 'Subtitle uploaded successfully',
            'url': f'/api/media/{media_id}/subtitles/{lang}'
        })
    
    @app.route('/api/media/<int:media_id>/subtitles/delete', methods=['POST'])
    def api_delete_subtitle(media_id):
        """Delete a subtitle file from disk"""
        data = request.get_json() or {}
        sub_path = data.get('path')  # full path for local files
        lang = data.get('lang')      # lang code for uploaded files
        
        deleted = []
        errors = []
        
        # Delete by full path (local subtitle next to video)
        if sub_path:
            from urllib.parse import unquote
            sub_path = unquote(sub_path)
            if os.path.exists(sub_path):
                try:
                    os.remove(sub_path)
                    deleted.append(sub_path)
                except Exception as e:
                    errors.append(f"Failed to delete {sub_path}: {e}")
            else:
                errors.append(f"File not found: {sub_path}")
        
        # Delete by lang code (uploaded subtitle in data/subtitles/)
        if lang:
            uploaded_path = get_subtitle_path(media_id, lang)
            if os.path.exists(uploaded_path):
                try:
                    os.remove(uploaded_path)
                    deleted.append(uploaded_path)
                except Exception as e:
                    errors.append(f"Failed to delete {uploaded_path}: {e}")
        
        if deleted:
            return jsonify({'success': True, 'deleted': deleted})
        else:
            return jsonify({'success': False, 'errors': errors}), 404
