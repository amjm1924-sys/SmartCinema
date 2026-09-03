from flask import Blueprint, request, jsonify
from renamer import Renamer
import os

from werkzeug.local import LocalProxy

toolbox_bp = Blueprint('toolbox', __name__)

_renamer = None
def get_renamer():
    global _renamer
    if _renamer is None:
        _renamer = Renamer()
    return _renamer

renamer = LocalProxy(get_renamer)

@toolbox_bp.route('/rename/preview', methods=['POST'])
def preview_rename():
    try:
        data = request.json
        path = data.get('path')
        if not path or not os.path.exists(path):
            return jsonify({'error': 'Invalid path'}), 400
            
        # Recursive scan or single folder?
        # User requested "Give path and rename them". Usually means folder.
        # Let's collect video files recursively.
        files = []
        for root, _, filenames in os.walk(path):
            for f in filenames:
                ext = os.path.splitext(f)[1].lower()
                if ext in ['.mp4', '.mkv', '.avi', '.ts', '.mov', '.wmv']:
                    files.append(os.path.join(root, f))
                    
        # Limit to 100 files for safety preview
        preview_files = files[:100]
        
        proposals = renamer.propose_names(preview_files)
        
        return jsonify({
            'total_files': len(files),
            'preview_count': len(proposals),
            'proposals': proposals
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@toolbox_bp.route('/rename/execute', methods=['POST'])
def execute_rename():
    try:
        data = request.json
        operations = data.get('operations', [])
        
        # Security: Ensure paths are safe?
        # Assuming admin access (this route should be protected)
        
        results = renamer.execute_rename(operations)
        return jsonify({
            'message': f"Processed {len(results)} files",
            'results': results
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==========================================
# Audio Converter API
# ==========================================

from audio_converter import converter_service

@toolbox_bp.route('/audio-convert/start', methods=['POST'])
def audio_convert_start():
    data = request.json
    path = data.get('path')
    if not path:
        return jsonify({'error': 'Path required'}), 400
        
    res = converter_service.start_conversion(path)
    if 'error' in res:
        return jsonify(res), 400
    return jsonify(res)

@toolbox_bp.route('/audio-convert/start-all', methods=['POST'])
def audio_convert_start_all():
    """Start audio conversion on all enabled library paths"""
    from database import get_library_paths
    paths = get_library_paths()
    
    # Filter only enabled paths that exist
    valid_paths = [p['path'] for p in paths if p.get('enabled', True) and os.path.exists(p.get('path', ''))]
    
    if not valid_paths:
        return jsonify({'error': 'No valid library paths found'}), 400
    
    res = converter_service.start_conversion(valid_paths)
    if 'error' in res:
        return jsonify(res), 400
    return jsonify(res)

@toolbox_bp.route('/audio-convert/status', methods=['GET'])
def audio_convert_status():
    return jsonify(converter_service.get_status())

@toolbox_bp.route('/audio-convert/cancel', methods=['POST'])
def audio_convert_cancel():
    return jsonify(converter_service.cancel_conversion())

# ==========================================
# Backup System API
# ==========================================

from backup_service import backup_service

@toolbox_bp.route('/backup/start', methods=['POST'])
def backup_start():
    return jsonify(backup_service.start_manual_backup())
    
@toolbox_bp.route('/backup/status', methods=['GET'])
def backup_status():
    return jsonify(backup_service.get_status())
