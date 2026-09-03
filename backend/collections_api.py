"""
Collections Management Module
Handles custom and smart collections of media.
"""
from flask import Blueprint, jsonify, request
from database import get_connection

collections_bp = Blueprint('collections', __name__, url_prefix='/api/collections')

@collections_bp.route('', methods=['GET'])
def get_collections():
    """Get all collections"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Optimized query with subselects for counts and fallbacks
        query = """
            SELECT 
                c.*, 
                COUNT(ci.media_id) as item_count,
                (
                    SELECT m.poster_url 
                    FROM collection_items ci2 
                    JOIN media m ON ci2.media_id = m.id 
                    WHERE ci2.collection_id = c.id 
                    ORDER BY ci2.display_order ASC, ci2.added_at DESC 
                    LIMIT 1
                ) as fallback_poster,
                (
                    SELECT m.backdrop_url 
                    FROM collection_items ci3 
                    JOIN media m ON ci3.media_id = m.id 
                    WHERE ci3.collection_id = c.id 
                    ORDER BY ci3.display_order ASC, ci3.added_at DESC 
                    LIMIT 1
                ) as fallback_backdrop
            FROM collections c
            LEFT JOIN collection_items ci ON c.id = ci.collection_id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        """
        
        cursor.execute(query)
        collections = []
        for row in cursor.fetchall():
            col = dict(row)
            # Apply fallback logic
            if not col['poster_url'] and col['item_count'] > 0:
                col['poster_url'] = col['fallback_poster']
            if not col['backdrop_url'] and col['item_count'] > 0:
                col['backdrop_url'] = col['fallback_backdrop']
            
            # Remove helper keys
            col.pop('fallback_poster', None)
            col.pop('fallback_backdrop', None)
            
            collections.append(col)
            
    return jsonify(collections)

@collections_bp.route('/<int:collection_id>', methods=['GET'])
def get_collection_details(collection_id):
    """Get details of a specific collection"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Get collection info
        cursor.execute("SELECT * FROM collections WHERE id = ?", (collection_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Collection not found'}), 404
            
        collection = dict(row)
        
        # Get media items
        cursor.execute("""
            SELECT m.* 
            FROM media m
            JOIN collection_items ci ON m.id = ci.media_id
            WHERE ci.collection_id = ?
            ORDER BY ci.display_order ASC, ci.added_at DESC
        """, (collection_id,))
        
        collection['media'] = [dict(r) for r in cursor.fetchall()]
        
    return jsonify(collection)

@collections_bp.route('/smart/<smart_id>/items', methods=['GET'])
def get_smart_collection_items(smart_id):
    """Get items for a smart collection"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        query = ""
        params = ()
        
        if smart_id == 'trending':
            # Most watched in last 30 days
            # Join with watch_history to count plays
            query = """
                SELECT m.*, COUNT(wh.id) as watch_count
                FROM media m
                JOIN watch_history wh ON m.id = wh.media_id
                WHERE wh.timestamp > datetime('now', '-30 days')
                GROUP BY m.id
                ORDER BY watch_count DESC
                LIMIT 50
            """
        elif smart_id == 'top_rated':
            query = "SELECT * FROM media WHERE tmdb_rating > 0 ORDER BY tmdb_rating DESC LIMIT 50"
        elif smart_id == 'recently_added':
            query = "SELECT * FROM media ORDER BY id DESC LIMIT 50"
        elif smart_id.startswith('decade_'):
            # e.g. decade_1980
            try:
                decade = int(smart_id.split('_')[1])
                start_year = decade
                end_year = decade + 9
                query = "SELECT * FROM media WHERE year BETWEEN ? AND ? ORDER BY tmdb_rating DESC LIMIT 100"
                params = (start_year, end_year)
            except:
                return jsonify({'error': 'Invalid decade format'}), 400
        else:
            return jsonify({'error': 'Invalid smart collection'}), 400
            
        cursor.execute(query, params)
        items = [dict(row) for row in cursor.fetchall()]
        
        return jsonify(items)

@collections_bp.route('/smart', methods=['GET'])
def get_smart_collections():
    """Get smart collections (auto-generated)"""
    # Dynamic Decades (based on existing media)
    min_year = 1980
    max_year = 2025
    
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT MIN(year) as min_year, MAX(year) as max_year FROM media WHERE year > 1900")
            row = cursor.fetchone()
            if row and row['min_year']:
                min_year = row['min_year']
                max_year = row['max_year']
    except:
        pass
        
    decades = []
    # Round down to nearest decade
    start_decade = (min_year // 10) * 10
    end_decade = (max_year // 10) * 10
    
    # Generate decades safely
    current = end_decade
    while current >= start_decade:
        decades.append({
            'id': f'decade_{current}',
            'name': f'{current}s',
            'type': 'smart',
            'icon': 'calendar',
            'description': f'Best from the {current}s'
        })
        current -= 10

    fixed = [
        {'id': 'trending', 'name': 'Trending Now', 'type': 'smart', 'icon': 'flame', 'description': 'Most watched recently'},
        {'id': 'top_rated', 'name': 'Top Rated', 'type': 'smart', 'icon': 'star', 'description': 'Highest rated movies & shows'},
        {'id': 'recently_added', 'name': 'Recently Added', 'type': 'smart', 'icon': 'clock', 'description': 'Newest additions'}
    ]
    
    return jsonify(fixed + decades)

@collections_bp.route('/generate', methods=['POST'])
def generate_collections():
    """Auto-generate collections based on metadata (Sagas/Collections)"""
    # TODO: Implement complex logic for auto-grouping (e.g. "Marvel Cinematic Universe")
    # For now, just return success as this is an advanced feature
    return jsonify({'success': True, 'message': 'Collections generated', 'created': 0, 'movies_grouped': 0})

@collections_bp.route('', methods=['POST'])
def create_collection():
    """Create a new manual collection"""
    data = request.json
    name = data.get('name')
    if not name:
        return jsonify({'error': 'Name is required'}), 400
        
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Check for existing collection with same name
        cursor.execute("SELECT id FROM collections WHERE name = ? AND type = 'manual'", (name,))
        if cursor.fetchone():
            return jsonify({'error': 'Collection with this name already exists'}), 409

        cursor.execute("INSERT INTO collections (name, type) VALUES (?, 'manual')", (name,))
        conn.commit()
        new_id = cursor.lastrowid
        
    return jsonify({'success': True, 'id': new_id, 'name': name})

@collections_bp.route('/<int:collection_id>', methods=['DELETE'])
def delete_collection(collection_id):
    """Delete a collection"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM collections WHERE id = ?", (collection_id,))
        conn.commit()
        
    return jsonify({'success': True})

@collections_bp.route('/<int:collection_id>', methods=['PUT'])
def update_collection(collection_id):
    """Update collection details"""
    data = request.json
    
    with get_connection() as conn:
        cursor = conn.cursor()
        
        if 'name' in data:
            cursor.execute("UPDATE collections SET name = ? WHERE id = ?", (data['name'], collection_id))
            
        if 'poster_url' in data:
             cursor.execute("UPDATE collections SET poster_url = ? WHERE id = ?", (data['poster_url'], collection_id))
             
        conn.commit()
        
    return jsonify({'success': True})

@collections_bp.route('/<int:collection_id>/items', methods=['POST'])
def manage_collection_items(collection_id):
    """Add/Remove items from collection"""
    data = request.json
    add_ids = data.get('add_ids', [])
    remove_ids = data.get('remove_ids', [])
    
    with get_connection() as conn:
        cursor = conn.cursor()
        
        for mid in add_ids:
            cursor.execute("INSERT OR IGNORE INTO collection_items (collection_id, media_id) VALUES (?, ?)", (collection_id, mid))
            
        for mid in remove_ids:
            cursor.execute("DELETE FROM collection_items WHERE collection_id = ? AND media_id = ?", (collection_id, mid))
            
        conn.commit()
        
    return jsonify({'success': True})


# ============ TMDB Collection Auto-Processing ============

TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"


def process_movie_collection(media_id: int, collection_data: dict):
    """
    Process collection data when a movie is scanned from TMDB.
    Creates the collection if needed and links the movie.
    """
    if not collection_data or not collection_data.get('id'):
        return None
    
    tmdb_id = collection_data['id']
    name = collection_data.get('name', 'Unknown Collection')
    poster_path = collection_data.get('poster_path')
    backdrop_path = collection_data.get('backdrop_path')
    
    poster_url = f"{TMDB_IMAGE_BASE}/w500{poster_path}" if poster_path else None
    backdrop_url = f"{TMDB_IMAGE_BASE}/original{backdrop_path}" if backdrop_path else None
    
    # Download and optimize images
    from asset_manager import asset_manager
    
    final_poster_url = None
    if poster_url:
        local_poster = asset_manager.download_and_optimize(poster_url, 'poster')
        if local_poster:
            final_poster_url = f"/api/images/{local_poster}"
            
    final_backdrop_url = None
    if backdrop_url:
        local_backdrop = asset_manager.download_and_optimize(backdrop_url, 'backdrop')
        if local_backdrop:
            final_backdrop_url = f"/api/images/{local_backdrop}"
    
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Check if collection exists
        cursor.execute("SELECT id FROM collections WHERE tmdb_id = ?", (tmdb_id,))
        existing = cursor.fetchone()
        
        if existing:
            collection_id = existing['id']
            # Update existing collection with better data if available
            cursor.execute("""
                UPDATE collections 
                SET name = ?, poster_url = COALESCE(?, poster_url), backdrop_url = COALESCE(?, backdrop_url)
                WHERE tmdb_id = ?
            """, (name, final_poster_url, final_backdrop_url, tmdb_id))
        else:
            # Create new collection
            cursor.execute("""
                INSERT INTO collections (name, type, tmdb_id, poster_url, backdrop_url)
                VALUES (?, 'tmdb', ?, ?, ?)
            """, (name, tmdb_id, final_poster_url, final_backdrop_url))
            collection_id = cursor.lastrowid
        
        # Update media with collection reference
        
        # Update media with collection reference
        cursor.execute("""
            UPDATE media SET collection_tmdb_id = ? WHERE id = ?
        """, (tmdb_id, media_id))
        
        # Link media to collection (ignore if already exists)
        cursor.execute("""
            INSERT OR IGNORE INTO collection_items (collection_id, media_id)
            VALUES (?, ?)
        """, (collection_id, media_id))
        
        conn.commit()
        print(f"[Collections] Linked movie {media_id} to collection '{name}' (ID: {collection_id})")
        
    return collection_id


@collections_bp.route('/tmdb/<int:tmdb_id>/extended', methods=['GET'])
def get_extended_collection(tmdb_id):
    """
    Get generic collection details merged with local library status.
    Used for "Saga View" to show missing parts.
    """
    try:
        from metadata import MetadataFetcher
        fetcher = MetadataFetcher()
        
        # 1. Fetch full collection from TMDB
        col_data = fetcher.get_collection_details(tmdb_id)
        if not col_data:
            return jsonify({'error': 'Collection not found on TMDB'}), 404
            
        # Filter out parts with no release date (Rumored/Planned movies)
        parts = [p for p in col_data.get('parts', []) if p.get('release_date')]
        
        # 2. Check local library coverage
        # We need to know which of these TMDB IDs are in our DB
        tmdb_ids = [p['id'] for p in parts]
        
        if not tmdb_ids:
             return jsonify({
                'id': col_data['id'],
                'name': col_data['name'],
                'overview': col_data['overview'],
                'poster_path': col_data['poster_path'],
                'backdrop_path': col_data['backdrop_path'],
                'parts': []
            })

        with get_connection() as conn:
            cursor = conn.cursor()
            # Dynamic placeholders
            placeholders = ','.join(['?'] * len(tmdb_ids))
            query = f"SELECT id, tmdb_id, title, poster_url, quality FROM media WHERE tmdb_id IN ({placeholders})"
            cursor.execute(query, tmdb_ids)
            local_map = {row['tmdb_id']: dict(row) for row in cursor.fetchall()}
            
        # 3. Merge and Format
        extended_parts = []
        for part in parts:
            pid = part['id']
            in_library = pid in local_map
            
            part_info = {
                'id': pid, # TMDB ID
                'title': part.get('title'),
                'release_date': part.get('release_date'),
                'poster_path': part.get('poster_path'),
                'backdrop_path': part.get('backdrop_path'),
                'overview': part.get('overview'),
                'vote_average': part.get('vote_average'),
                'in_library': in_library
            }
            
            if in_library:
                local_item = local_map[pid]
                part_info['media_id'] = local_item['id']
                part_info['local_poster'] = local_item['poster_url']
                part_info['quality'] = local_item['quality']
            
            extended_parts.append(part_info)
            
        # Sort by release date
        extended_parts.sort(key=lambda x: x.get('release_date') or '9999-99-99')
        
        return jsonify({
            'id': col_data['id'],
            'name': col_data['name'],
            'overview': col_data['overview'],
            'poster_path': col_data['poster_path'],
            'backdrop_path': col_data['backdrop_path'],
            'parts': extended_parts
        })
        
    except Exception as e:
        print(f"Error fetching extended collection: {e}")
        return jsonify({'error': str(e)}), 500

