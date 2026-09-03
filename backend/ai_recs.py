import sqlite3
from typing import List, Dict

def get_recommendations(media_id: int, limit: int = 12) -> List[Dict]:
    """Get AI content-based recommendations using TF-IDF and Cosine Similarity"""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import linear_kernel
    from database import get_db
    conn = get_db()
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. Fetch all eligible media (exclude episodes)
    cursor.execute('''
        SELECT id, title, overview, genres, type, tmdb_rating, year, poster_url, backdrop_url, duration, format
        FROM media
        WHERE type != "episode"
    ''')
    all_media = [dict(row) for row in cursor.fetchall()]
    
    if not all_media:
        conn.close()
        return []

    # Check if target exists
    target_idx = next((i for i, m in enumerate(all_media) if m['id'] == media_id), None)
    if target_idx is None:
        conn.close()
        return []

    # 2. Extract Cast & Crew to enrich context
    cursor.execute('''
        SELECT mc.media_id, c.name, mc.role
        FROM media_cast mc
        JOIN cast_members c ON mc.person_id = c.id
    ''')
    cast_data = cursor.fetchall()
    conn.close()
    
    # Group cast by media_id
    media_cast_map = {}
    for row in cast_data:
        m_id = row['media_id']
        raw_name = row['name']
        if not raw_name:
            continue
            
        name = raw_name.replace(' ', '') # John Doe -> JohnDoe for exact token matching
        if m_id not in media_cast_map:
            media_cast_map[m_id] = []
        media_cast_map[m_id].append(name)
        
    # 3. Build Metadata 'Soup'
    soups = []
    for media in all_media:
        soup_parts = []
        
        # Add Overview (weight x1)
        if media.get('overview'):
            soup_parts.append(media['overview'])
            
        # Add Genres (weight x4 to heavily influence context based on user request)
        if media.get('genres'):
            genre_str = media['genres'].replace(',', ' ')
            soup_parts.extend([genre_str, genre_str, genre_str, genre_str])
            
        # Add Cast & Crew (weight x2)
        cast_list = media_cast_map.get(media['id'], [])
        if cast_list:
            cast_str = ' '.join(cast_list)
            soup_parts.extend([cast_str, cast_str])
            
        soups.append(" ".join(soup_parts))
        
    # 4. TF-IDF Calculation
    # We use english stop words to ignore "the", "a", "is", etc in overviews
    tfidf = TfidfVectorizer(stop_words='english')
    
    try:
        tfidf_matrix = tfidf.fit_transform(soups)
    except ValueError:
        # Vocabulary empty (e.g., no overviews/genres)
        return []

    # 5. Compute Cosine Similarity for the target item against all others
    cosine_sim = linear_kernel(tfidf_matrix[target_idx], tfidf_matrix).flatten()
    
    # 6. Sort by similarity score (descending)
    # enumerate gives (index, score)
    sim_scores = list(enumerate(cosine_sim))
    sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)
    
    # 7. Get top results (skipping the first one as it is the item itself)
    # We also skip items that have a score of 0.0 (no overlap at all)
    top_indices = [i[0] for i in sim_scores if i[0] != target_idx and i[1] > 0.0]
    
    recommendations = []
    
    # If we didn't get enough from AI (e.g. brand new sparse DB), fallback to high rated
    if not top_indices:
        sorted_by_rating = sorted([m for m in all_media if m['id'] != media_id], 
                                  key=lambda x: x.get('tmdb_rating') or 0, reverse=True)
        recommendations = sorted_by_rating[:limit]
    else:
        for idx in top_indices[:limit]:
            item = all_media[idx]
            # Add similarity score for debugging/UI if needed
            item['similarity_score'] = round(sim_scores[idx][1] * 100, 1)
            recommendations.append(item)
            
    return recommendations
