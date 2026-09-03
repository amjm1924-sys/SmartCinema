
from flask import Blueprint, request, jsonify
from ai_service import ai_service
from database import get_connection

def query_db(query, args=(), one=False):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(query, args)
        rv = [dict(row) for row in cursor.fetchall()]
        return (rv[0] if rv else None) if one else rv

from metadata import MetadataFetcher, TMDB_IMAGE_BASE

ai_bp = Blueprint('ai', __name__)
metadata_fetcher = MetadataFetcher()

@ai_bp.route('/recommend', methods=['POST'])
def recommend():
    try:
        data = request.json
        media_id = data.get('media_id')
        media_type = data.get('media_type', 'movie')
        
        # 1. Fetch Media Metadata
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM media WHERE id = ?", (media_id,))
            media = cursor.fetchone()
            
        if not media:
            return jsonify({'error': 'Media not found'}), 404
            
        media_dict = dict(media)
        # Use the type from the database, fallback to provided or movie
        media_type = media_dict.get('type', data.get('media_type', 'movie'))
        
        # 2. Call AI Service (with graceful fallback if no AI key or provider available)
        try:
            recommendations = ai_service.get_recommendations(media_dict)
        except Exception as ai_err:
            try:
                from session_logger import session_logger
                session_logger.log_backend('INFO', f"[AI] No active AI provider for recommendations: {ai_err}")
            except Exception:
                pass
            return jsonify([])

        if not recommendations or not isinstance(recommendations, list):
            return jsonify([])
        
        # 3. Resolve to Local/TMDB
        resolved = []
        for item in recommendations:
            if isinstance(item, dict):
                # Try to catch variations in keys from AI
                title = item.get('title') or item.get('Title') or item.get('name') or item.get('Name')
                year = item.get('year') or item.get('Year')
                rec_type = item.get('type') or item.get('Type')
            else:
                title = item
                year = None
                rec_type = None
                
            if not title: continue

            # Check Local
            # Try to match title AND year if available (for better precision)
            local_match = None
            if year:
                 # Strict search with year
                 local_match = query_db("SELECT id, title, poster_url, year, type FROM media WHERE title LIKE ? AND year = ? LIMIT 1", (f"%{title}%", year), one=True)
            
            if not local_match:
                 # Fallback to loose title search
                 local_match = query_db("SELECT id, title, poster_url, type FROM media WHERE title LIKE ? LIMIT 1", (f"%{title}%",), one=True)

            if local_match:
                resolved.append({
                    'title': title,
                    'is_local': True,
                    'id': local_match['id'],
                    'poster': local_match['poster_url'],
                    'year': local_match.get('year'),
                    'type': local_match.get('type')
                })
            else:
                # Fallback to TMDB Search
                try:
                    tmdb_match = None
                    # Determine type to search first based on rec_type or source media_type
                    primary_type = rec_type if rec_type else ('tv' if media_type in ['series', 'tv'] else 'movie')
                    
                    if primary_type in ['series', 'tv']:
                        tmdb_match = metadata_fetcher.search_tv(title, language='en-US') 
                        if not tmdb_match: # Fallback to movie
                            tmdb_match = metadata_fetcher.search_movie(title, year=year, language='en-US')
                    else:
                        tmdb_match = metadata_fetcher.search_movie(title, year=year, language='en-US')
                        if not tmdb_match and year:
                            # Retry without year if AI hallucinated the year slightly wrong
                            tmdb_match = metadata_fetcher.search_movie(title, language='en-US')
                        if not tmdb_match: # Fallback to TV
                            tmdb_match = metadata_fetcher.search_tv(title, language='en-US')

                    if tmdb_match:
                        # Extract poster (detailed models use poster_url, raw raw searches use poster_path)
                        poster_val = tmdb_match.get('poster_url')
                        if not poster_val and tmdb_match.get('poster_path'):
                            poster_val = f"https://image.tmdb.org/t/p/w500{tmdb_match['poster_path']}"
                            
                        # Extract tmdb_id (detailed models use tmdb_id, raw searches use id)
                        tmdb_id_val = tmdb_match.get('tmdb_id')
                        if not tmdb_id_val:
                            tmdb_id_val = tmdb_match.get('id')

                        # Fallback for tv series titles
                        resolved_title = tmdb_match.get('title') or tmdb_match.get('name') or title
                        
                        # Determine actual type from TMDB result
                        actual_type = 'series' if 'first_air_date' in tmdb_match or 'name' in tmdb_match else 'movie'

                        if poster_val:
                            resolved.append({
                                'title': resolved_title,
                                'is_local': False,
                                'id': tmdb_id_val,
                                'poster': poster_val,
                                'year': str(tmdb_match.get('year', '') or tmdb_match.get('first_air_date', '')[:4]) if (tmdb_match.get('year') or tmdb_match.get('first_air_date')) else '',
                                'overview': tmdb_match.get('overview', ''),
                                'tmdb_id': tmdb_id_val,
                                'type': actual_type
                            })
                        else:
                            resolved.append({
                                'title': resolved_title,
                                'is_local': False,
                                'id': tmdb_id_val,
                                'tmdb_id': tmdb_id_val,
                                'type': actual_type
                            })
                    else:
                        print(f"DEBUG AI_API: No tmdb_match found for title='{title}', year={year}")
                        resolved.append({
                            'title': title,
                            'is_local': False,
                            'type': primary_type
                        })
                except Exception as e:
                    print(f"DEBUG AI_API: Exception while resolving '{title}': {e}")
                    import traceback
                    traceback.print_exc()
                    # Don't fail entire request if one lookup fails
                    resolved.append({
                        'title': title,
                        'is_local': False
                    })
                
        return jsonify(resolved)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@ai_bp.route('/status', methods=['GET'])
def status():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, provider, is_active, total_tokens_used, error_count, last_used FROM ai_keys")
        keys = [dict(row) for row in cursor.fetchall()]
    return jsonify(keys)

@ai_bp.route('/catchup-summary', methods=['POST'])
def catchup_summary():
    try:
        data = request.json
        series_title = data.get('series_title')
        season_num = data.get('season_num')
        episode_num = data.get('episode_num')
        
        if not series_title or not season_num or not episode_num:
            return jsonify({'error': 'Missing parameters'}), 400
            
        summary_data = ai_service.generate_catchup_summary(series_title, season_num, episode_num)
        return jsonify(summary_data)
    except Exception as e:
        try:
            from session_logger import session_logger
            session_logger.log_backend('INFO', f"[AI] Catchup summary unavailable: {e}")
        except Exception:
            pass
        return jsonify({'summary': None, 'message': 'ميزة تلخيص الذكاء الاصطناعي غير متاحة حالياً'}), 200

@ai_bp.route('/keys', methods=['POST'])
def add_key():
    data = request.json
    provider = data.get('provider')
    key = data.get('api_key')
    
    if not provider or not key:
        return jsonify({'error': 'Missing provider or key'}), 400
        
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO ai_keys (provider, api_key) VALUES (?, ?)", (provider, key))
        conn.commit()
        
    return jsonify({'success': True})

@ai_bp.route('/keys/<int:key_id>', methods=['DELETE'])
def delete_key(key_id):
    with get_connection() as conn:
        conn.execute("DELETE FROM ai_keys WHERE id = ?", (key_id,))
        conn.commit()
    return jsonify({'success': True})

@ai_bp.route('/playlists/generate', methods=['POST'])
def generate_ai_playlist():
    try:
        data = request.json
        prompt = data.get('prompt')
        if not prompt:
            return jsonify({'error': 'Missing prompt'}), 400
            
        result = ai_service.generate_dynamic_playlist(prompt)
        
        name = result.get('name', 'AI Playlist')
        description = result.get('description', '')
        media_ids = result.get('media_ids', [])
        
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('INSERT INTO playlists (name, description) VALUES (?, ?)', (name, description))
            playlist_id = cursor.lastrowid
            
            # Insert items
            for idx, m_id in enumerate(media_ids):
                cursor.execute('INSERT OR IGNORE INTO playlist_items (playlist_id, media_id, order_num) VALUES (?, ?, ?)',
                               (playlist_id, m_id, idx))
            
            conn.commit()
            
        return jsonify({
            'success': True,
            'playlist_id': playlist_id,
            'name': name,
            'count': len(media_ids)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
