"""
IPTV Management Module
Handles M3U playlists and live TV channels.
"""
from flask import Blueprint, jsonify, request
from database import get_connection
import requests
import re

iptv_bp = Blueprint('iptv', __name__, url_prefix='/api/iptv')

@iptv_bp.route('/playlists', methods=['GET'])
def get_playlists():
    """Get all IPTV playlists"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM iptv_playlists ORDER BY created_at DESC")
        playlists = [dict(row) for row in cursor.fetchall()]
        # Add channel count placeholder or real count if possible
        for p in playlists:
            p['count'] = 0 # Placeholder for now until we parse
        return jsonify(playlists)

@iptv_bp.route('/playlists', methods=['POST'])
def add_playlist():
    """Add a new playlist"""
    data = request.json
    name = data.get('name')
    url = data.get('url')
    
    if not name or not url:
        return jsonify({'error': 'Name and URL are required'}), 400
        
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO iptv_playlists (name, url) VALUES (?, ?)", (name, url))
        conn.commit()
        new_id = cursor.lastrowid
        
    # TODO: Trigger background parsing of M3U
    
    return jsonify({'success': True, 'id': new_id, 'name': name})

@iptv_bp.route('/groups', methods=['GET'])
def get_groups():
    """Get channel groups"""
    # TODO: return distinct groups from channels table
    return jsonify([])

@iptv_bp.route('/channels', methods=['GET'])
def get_channels():
    """Get channels (optionally filtered by group)"""
    # TODO: return channels from channels table
    return jsonify([])
