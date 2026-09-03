from flask import Blueprint, jsonify, request
from database import get_connection

playlists_bp = Blueprint('playlists', __name__, url_prefix='/api/playlists')

@playlists_bp.route('', methods=['GET'])
def get_playlists():
    """Get all playlists"""
    with get_connection() as conn:
        cursor = conn.cursor()
        # Get playlists with item count and first poster
        cursor.execute('''
            SELECT p.*, 
                   COUNT(pi.media_id) as item_count,
                   (SELECT m.poster_url FROM playlist_items pi2 
                    JOIN media m ON pi2.media_id = m.id 
                    WHERE pi2.playlist_id = p.id 
                    ORDER BY pi2.order_num ASC LIMIT 1) as poster_url
            FROM playlists p
            LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
        ''')
        return jsonify([dict(row) for row in cursor.fetchall()])

@playlists_bp.route('', methods=['POST'])
def create_playlist():
    """Create a new playlist"""
    data = request.json
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name is required'}), 400
        
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT INTO playlists (name, description) VALUES (?, ?)', 
                      (name, data.get('description', '')))
        playlist_id = cursor.lastrowid
        conn.commit()
        
        return jsonify({'id': playlist_id, 'name': name}), 201

@playlists_bp.route('/<int:playlist_id>', methods=['GET'])
def get_playlist_details(playlist_id):
    """Get playlist details and items"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM playlists WHERE id = ?', (playlist_id,))
        playlist = cursor.fetchone()
        if not playlist:
            return jsonify({'error': 'Playlist not found'}), 404
            
        # Get items
        cursor.execute('''
            SELECT m.*, pi.added_at as playlist_added_at
            FROM media m
            JOIN playlist_items pi ON m.id = pi.media_id
            WHERE pi.playlist_id = ?
            ORDER BY pi.order_num ASC, pi.added_at ASC
        ''', (playlist_id,))
        
        items = [dict(row) for row in cursor.fetchall()]
        
        return jsonify({**dict(playlist), 'items': items})

@playlists_bp.route('/<int:playlist_id>/items', methods=['POST'])
def add_to_playlist(playlist_id):
    """Add media to playlist"""
    data = request.json
    media_id = data.get('media_id')
    
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Check if playlist exists
        cursor.execute('SELECT 1 FROM playlists WHERE id = ?', (playlist_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Playlist not found'}), 404
            
        # Check if already exists
        cursor.execute('SELECT 1 FROM playlist_items WHERE playlist_id = ? AND media_id = ?', (playlist_id, media_id))
        if cursor.fetchone():
             return jsonify({'status': 'exists'}), 200

        # Get max order
        cursor.execute('SELECT MAX(order_num) FROM playlist_items WHERE playlist_id = ?', (playlist_id,))
        max_order = cursor.fetchone()[0] or 0
        
        cursor.execute('INSERT INTO playlist_items (playlist_id, media_id, order_num) VALUES (?, ?, ?)',
                      (playlist_id, media_id, max_order + 1))
        conn.commit()
        
        return jsonify({'status': 'added'}), 201

@playlists_bp.route('/<int:playlist_id>', methods=['DELETE'])
def delete_playlist(playlist_id):
    """Delete a playlist"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM playlists WHERE id = ?', (playlist_id,))
        conn.commit()
        return jsonify({'status': 'deleted'})

@playlists_bp.route('/<int:playlist_id>/items/<int:media_id>', methods=['DELETE'])
def remove_from_playlist(playlist_id, media_id):
    """Remove item from playlist"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM playlist_items WHERE playlist_id = ? AND media_id = ?', 
                      (playlist_id, media_id))
        conn.commit()
        return jsonify({'status': 'removed'})
