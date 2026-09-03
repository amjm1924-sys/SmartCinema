# Favorites functions
from database import get_db

def add_to_favorites(media_id: int, profile_id: int = 1) -> bool:
    """Add media to favorites for a specific profile"""
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute(
            'INSERT INTO favorites (media_id, profile_id) VALUES (?, ?)',
            (media_id, profile_id)
        )
        conn.commit()
        return True
    except:
        return False
    finally:
        conn.close()

def remove_from_favorites(media_id: int, profile_id: int = 1) -> bool:
    """Remove media from favorites for a specific profile"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM favorites WHERE media_id = ? AND profile_id = ?', (media_id, profile_id))
    conn.commit()
    conn.close()
    return True

def is_favorite(media_id: int, profile_id: int = 1) -> bool:
    """Check if media is in favorites for a specific profile"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT COUNT(*) FROM favorites WHERE media_id = ? AND profile_id = ?', (media_id, profile_id))
    result = cursor.fetchone()[0] > 0
    conn.close()
    return result

def get_all_favorites(profile_id: int = 1) -> list:
    """Get all favorite media for a specific profile"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT m.*, f.added_at 
        FROM media m
        JOIN favorites f ON m.id = f.media_id
        WHERE f.profile_id = ?
        ORDER BY f.added_at DESC
    ''', (profile_id,))
    
    favorites = []
    for row in cursor.fetchall():
        favorites.append(dict(row))
    
    conn.close()
    return favorites

# Recommendations functions

def get_recommendations(media_id: int = None, limit: int = 10) -> list:
    """Get recommended media based on genres or random"""
    conn = get_db()
    cursor = conn.cursor()
    
    if media_id:
        # Get genres of the media
        cursor.execute('SELECT genres FROM media WHERE id = ?', (media_id,))
        row = cursor.fetchone()
        if row and row['genres']:
            # Split genres and clean whitespace
            genres = [g.strip() for g in row['genres'].split(',') if g.strip()]
            
            if not genres:
                return []
                
            # Construct query to match ANY genre
            # Cross-media is enabled by type != "episode" (so movies and series are included)
            placeholders = ' OR '.join(['genres LIKE ?'] * len(genres))
            params = [media_id] + [f'%{g}%' for g in genres] + [limit]
            
            cursor.execute(f'''
                SELECT * FROM media 
                WHERE type != "episode" 
                AND id != ? 
                AND ({placeholders})
                ORDER BY tmdb_rating DESC, imdb_rating DESC, year DESC
                LIMIT ?
            ''', params)
            
            recommendations = []
            for row in cursor.fetchall():
                recommendations.append(dict(row))
            
            conn.close()
            return recommendations
    
    # Random recommendations with good ratings
    cursor.execute('''
        SELECT * FROM media 
        WHERE type != "episode"
        AND (imdb_rating >= 7.0 OR tmdb_rating >= 7.0)
        ORDER BY RANDOM()
        LIMIT ?
    ''', (limit,))
    
    recommendations = []
    for row in cursor.fetchall():
        recommendations.append(dict(row))
    
    conn.close()
    return recommendations
