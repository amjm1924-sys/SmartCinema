# Metadata Fetcher for CinemaStream
# Fetches posters, ratings, and info from TMDb API (free)

import os
import re
import json
import time
import hashlib
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Dict, List, Optional
from functools import lru_cache

try:
    from session_logger import session_logger as _slog
except ImportError:
    _slog = None

def _log(level, msg):
    """Log to session_logger if available, fallback to print"""
    if _slog:
        _slog.log_backend(level, f'[Metadata] {msg}')
    else:
        print(f'[Metadata] [{level}] {msg}')

# TMDb API (free tier)
TMDB_API_KEY = os.environ.get('TMDB_API_KEY', '0b1762ea5ebd14681d16fb9d19919c9a')
TMDB_BASE_URL = 'https://api.themoviedb.org/3'
TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

# Cache directory
CACHE_DIR = Path(__file__).parent.parent / 'data' / 'cache'
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Image cache directory
IMAGE_CACHE_DIR = Path(__file__).parent.parent / 'data' / 'images'
IMAGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

class MetadataFetcher:
    """Fetches metadata from TMDb and other sources"""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or TMDB_API_KEY
        self.cache_dir = CACHE_DIR
        self.image_cache_dir = IMAGE_CACHE_DIR
        self.request_count = 0
        self.last_request_time = 0
    
    def _rate_limit(self):
        """Simple rate limiting - max 40 requests per 10 seconds"""
        current_time = time.time()
        if current_time - self.last_request_time < 0.25:  # 4 requests per second max
            time.sleep(0.25 - (current_time - self.last_request_time))
        self.last_request_time = time.time()
    
    def _make_request(self, endpoint: str, params: dict = None) -> Optional[dict]:
        """Make a request to TMDb API"""
        if not self.api_key:
            return None
        
        self._rate_limit()
        
        params = params or {}
        params['api_key'] = self.api_key
        
        url = f"{TMDB_BASE_URL}{endpoint}?{urllib.parse.urlencode(params)}"
        
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={'Accept': 'application/json'})
                with urllib.request.urlopen(req, timeout=30) as response:
                    return json.loads(response.read().decode('utf-8'))
            except Exception as e:
                _log('WARN', f"TMDb API request failed (Attempt {attempt+1}/3): {e}")
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))
        
        return None
    
    def _get_cache_path(self, key: str) -> Path:
        """Get cache file path for a key"""
        hash_key = hashlib.md5(key.encode()).hexdigest()
        return self.cache_dir / f"{hash_key}.json"
    
    def _get_cached(self, key: str) -> Optional[dict]:
        """Get cached data"""
        cache_path = self._get_cache_path(key)
        if cache_path.exists():
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # Cache for 7 days
                    if time.time() - data.get('_cached_at', 0) < 7 * 24 * 3600:
                        return data
            except Exception as e:
                _log('WARN', f'Cache read failed: {e}')
        return None
    
    def _set_cache(self, key: str, data: dict):
        """Cache data"""
        cache_path = self._get_cache_path(key)
        data['_cached_at'] = time.time()
        try:
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception as e:
            _log('WARN', f'Cache write failed: {e}')
    
    def search_movie(self, title: str, year: int = None, language: str = None) -> Optional[dict]:
        """Search for a movie by title with smart matching"""
        cache_key = f"movie_search_{title}_{year}_{language}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached
        
        lang = language or 'ar-SA'
        params = {'query': title, 'language': lang}
        if year:
            params['year'] = year
        
        result = self._make_request('/search/movie', params)
        
        if result and result.get('results'):
            # SMART MATCHING: Find best title match, not just first result
            best_match = self._find_best_match(title, result['results'], year)
            
            if best_match:
                movie_details = self.get_movie_details(best_match['id'])
                if movie_details:
                    self._set_cache(cache_key, movie_details)
                    return movie_details
        
        # Try English fallback if no specific language was requested
        if not language:
            params['language'] = 'en-US'
            result = self._make_request('/search/movie', params)
            
            if result and result.get('results'):
                best_match = self._find_best_match(title, result['results'], year)
                if best_match:
                    movie_details = self.get_movie_details(best_match['id'])
                    if movie_details:
                        self._set_cache(cache_key, movie_details)
                        return movie_details
        
        return None
    
    def _find_best_match(self, search_title: str, results: list, year: int = None) -> Optional[dict]:
        """Find best matching movie from search results based on title similarity"""
        if not results:
            return None
            
        search_lower = search_title.lower().strip()
        search_core = search_lower
        for prefix in ['the ', 'a ', 'an ']:
            if search_core.startswith(prefix):
                search_core = search_core[len(prefix):]
                break
        
        # Score each result
        scored_results = []
        for movie in results:
            score = 0
            movie_title = (movie.get('title') or movie.get('name') or '').lower()
            original_title = (movie.get('original_title') or movie.get('original_name') or '').lower()
            
            movie_core = movie_title
            orig_core = original_title
            for prefix in ['the ', 'a ', 'an ']:
                if movie_core.startswith(prefix): movie_core = movie_core[len(prefix):]
                if orig_core.startswith(prefix): orig_core = orig_core[len(prefix):]
            
            # Exact match = highest priority
            if movie_title == search_lower or original_title == search_lower:
                score += 100
            elif movie_core == search_core or orig_core == search_core:
                score += 90
            # Title starts with search term
            elif movie_title.startswith(search_lower) or original_title.startswith(search_lower):
                score += 50
            # Search term in title
            elif search_lower in movie_title or search_lower in original_title:
                score += 25
            else:
                # Check word-by-word match
                search_words = set(search_core.split())
                title_words = set(movie_core.split())
                common = search_words & title_words
                score += len(common) * 10

            
            # Year match bonus
            if year:
                movie_year = movie.get('release_date', '')[:4]
                if movie_year and str(year) == movie_year:
                    score += 30
            
            # Popularity bonus (small)
            score += min(movie.get('popularity', 0) / 10, 5)
            
            scored_results.append((score, movie))
        
        # Sort by score desc
        scored_results.sort(key=lambda x: x[0], reverse=True)
        
        # Return best match if score > 0, else first result as fallback
        if scored_results:
            if scored_results[0][0] > 0:
                return scored_results[0][1]
            return results[0]  # Fallback to first result
        
        return None
    
    def search_tv(self, title: str, language: str = None) -> Optional[dict]:
        """Search for a TV series by title"""
        cache_key = f"tv_search_{title}_{language}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached
        
        lang = language or 'ar-SA'
        params = {'query': title, 'language': lang}
        result = self._make_request('/search/tv', params)
        
        if result and result.get('results'):
            best_match = self._find_best_match(title, result['results'])
            if best_match:
                series_details = self.get_tv_details(best_match['id'])
                if series_details:
                    self._set_cache(cache_key, series_details)
                    return series_details
        
        # Try English fallback if no specific language was requested
        if not language:
            params['language'] = 'en-US'
            result = self._make_request('/search/tv', params)
            
            if result and result.get('results'):
                best_match = self._find_best_match(title, result['results'])
                if best_match:
                    series_details = self.get_tv_details(best_match['id'])
                    if series_details:
                        self._set_cache(cache_key, series_details)
                        return series_details
        
        return None
    
    def search_movie_candidates(self, title: str, year: int = None, language: str = None) -> List[dict]:
        """Search for a movie and return list of candidates"""
        # Feature: Support Search by TMDB ID
        if title.isdigit():
            movie_id = int(title)
            details = self.get_movie_details(movie_id, language)
            if details:
                return [{
                    'id': details['tmdb_id'],
                    'tmdb_id': details['tmdb_id'],
                    'title': details['title'],
                    'original_title': details['original_title'],
                    'year': details['year'],
                    'overview': details['overview'],
                    'poster_url': details['poster_url'].replace('/original', '/w200') if details.get('poster_url') else None,
                    'vote_average': details['tmdb_rating']
                }]

        lang = language or 'en-US'
        params = {'query': title, 'language': lang}
        if year:
            params['year'] = year
        
        result = self._make_request('/search/movie', params)
        candidates = []
        
        if result and result.get('results'):
            for item in result['results'][:5]: # Return top 5
                candidates.append({
                    'id': item['id'],
                    'tmdb_id': item['id'],
                    'title': item.get('title'),
                    'original_title': item.get('original_title'),
                    'year': int(item['release_date'][:4]) if item.get('release_date') else None,
                    'overview': item.get('overview'),
                    'poster_url': f"{TMDB_IMAGE_BASE}/w200{item['poster_path']}" if item.get('poster_path') else None,
                    'vote_average': item.get('vote_average')
                })
                
        return candidates

    def search_tv_candidates(self, title: str, language: str = None) -> List[dict]:
        """Search for a TV series and return list of candidates"""
        # Feature: Support Search by TMDB ID
        if title.isdigit():
            tv_id = int(title)
            details = self.get_tv_details(tv_id, language)
            if details:
                return [{
                    'id': details['tmdb_id'],
                    'tmdb_id': details['tmdb_id'],
                    'title': details['title'],
                    'original_title': details['original_title'],
                    'year': details['year'],
                    'overview': details['overview'],
                    'poster_url': details['poster_url'].replace('/original', '/w200') if details.get('poster_url') else None,
                    'vote_average': details['tmdb_rating']
                }]

        lang = language or 'en-US'
        params = {'query': title, 'language': lang}
        
        result = self._make_request('/search/tv', params)
        candidates = []
        
        if result and result.get('results'):
            for item in result['results'][:5]: # Return top 5
                candidates.append({
                    'id': item['id'],
                    'tmdb_id': item['id'],
                    'title': item.get('name'),
                    'original_title': item.get('original_name'),
                    'year': int(item['first_air_date'][:4]) if item.get('first_air_date') else None,
                    'overview': item.get('overview'),
                    'poster_url': f"{TMDB_IMAGE_BASE}/w200{item['poster_path']}" if item.get('poster_path') else None,
                    'vote_average': item.get('vote_average')
                })
                
        return candidates
    
    def find_alternative_trailer(self, tmdb_id: int, media_type: str, blocked_id: str = None) -> Optional[str]:
        """Find an alternative video (Teaser, Clip) if the main trailer is blocked"""
        try:
            endpoint = f"/movie/{tmdb_id}/videos" if media_type == 'movie' else f"/tv/{tmdb_id}/videos"
            data = self._make_request(endpoint)
            
            if not data or 'results' not in data:
                return None
                
            results = data['results']
            
            # 1. Filter for YouTube only
            candidates = [v for v in results if v.get('site') == 'YouTube']
            
            # 2. Filter out the blocked ID if provided
            if blocked_id:
                candidates = [v for v in candidates if v.get('key') != blocked_id]
                
            if not candidates:
                return None
                
            # Priority: Trailer > Teaser > Clip > Featurette
            # We already know the *main* trailer might be blocked, but maybe there's a *different* trailer?
            
            # Sort by priority
            type_priority = {'Trailer': 1, 'Teaser': 2, 'Clip': 3, 'Featurette': 4}
            
            # Sort candidates:
            # 1. By Type Priority
            # 2. By "official" flag (if available, though TMDB doesn't always have it)
            # 3. By newest date (published_at)
            
            def sort_key(v):
                prio = type_priority.get(v.get('type'), 99)
                date = v.get('published_at', '')
                return (prio, date) # Ascending priority, then date string (newer date sorts later? No, we want reverse date? Actually ISO dates sort lexically)
                
            # We want highest priority (lowest number) and NEWEST date.
            # Python sorts ascending. So (1, '2020') comes before (1, '2021').
            # We want '2021' first? usually newer is better quality?
            # Let's just pick based on Type first.
            
            best = min(candidates, key=lambda v: type_priority.get(v.get('type'), 99))
            
            return f"https://www.youtube.com/watch?v={best['key']}"
            
        except Exception as e:
            _log('WARN', f"Error finding alternative trailer: {e}")
            return None
    
    def get_movie_details(self, movie_id: int, language: str = None) -> Optional[dict]:
        """Get detailed movie information with STRICT language rules"""
        # Rule 1: Title MUST be English
        # Rule 2: Overview PREFERS Arabic, falls back to English
        
        cache_key = f"movie_details_v5_{movie_id}" # New cache key version
        cached = self._get_cached(cache_key)
        if cached:
            return cached
        
        # 1. Fetch Arabic Data (for Overview, Genres, etc.)
        result_ar = self._make_request(f'/movie/{movie_id}', {
            'language': 'ar-SA',
            'append_to_response': 'credits,videos,release_dates'
        })
        
        # 2. Fetch English Data (for TITLE, and fallback Overview + LOGO)
        result_en = self._make_request(f'/movie/{movie_id}', {
            'language': 'en-US',
            'append_to_response': 'videos,release_dates,images',
            'include_image_language': 'en,null'
        })
        
        if not result_ar and not result_en:
            return None
            
        if not result_ar:
            # If Arabic is completely missing, use English entirely
            result_ar = result_en
        elif not result_en:
            # Should rarely happen if ID is valid
            result_en = result_ar 

        # 3. Combine with strict rules
        metadata = self._format_movie_metadata(result_ar, result_en)
        self._set_cache(cache_key, metadata)
        return metadata
    
    def get_tv_details(self, tv_id: int, language: str = None) -> Optional[dict]:
        """Get detailed TV series information with STRICT language rules"""
        cache_key = f"tv_details_v5_{tv_id}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached
        
        # 1. Fetch Arabic Data
        result_ar = self._make_request(f'/tv/{tv_id}', {
            'language': 'ar-SA',
            'append_to_response': 'credits,videos,content_ratings'
        })
        
        # 2. Fetch English Data (for TITLE + LOGO)
        result_en = self._make_request(f'/tv/{tv_id}', {
            'language': 'en-US',
            'append_to_response': 'videos,images,content_ratings',
            'include_image_language': 'en,null'
        })
        
        if not result_ar and not result_en:
            return None
            
        if not result_ar:
            result_ar = result_en
        elif not result_en:
            result_en = result_ar
        
        # 3. Combine
        metadata = self._format_tv_metadata(result_ar, result_en)
        self._set_cache(cache_key, metadata)
        return metadata
    
    def get_episode_details(self, tv_id: int, season: int, episode: int) -> Optional[dict]:
        """Get episode details"""
        cache_key = f"episode_{tv_id}_{season}_{episode}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached
        
        result = self._make_request(f'/tv/{tv_id}/season/{season}/episode/{episode}', {
            'language': 'ar-SA'
        })
        
        if result:
            self._set_cache(cache_key, result)
        return result

    def get_collection_details(self, collection_id: int, language: str = None) -> Optional[dict]:
        """Get full collection details from TMDb"""
        cache_key = f"collection_{collection_id}_{language}"
        cached = self._get_cached(cache_key)
        if cached:
            return cached

        # Try Arabic first
        lang = language or 'ar-SA'
        result = self._make_request(f'/collection/{collection_id}', {'language': lang})
        
        if not result:
             # Fallback to English
             result = self._make_request(f'/collection/{collection_id}', {'language': 'en-US'})

        if result:
            self._set_cache(cache_key, result)
            
        return result
    
    def _format_movie_metadata(self, result_ar: dict, result_en: dict) -> dict:
        """Format movie metadata with STRICT language rules"""
        # Always use English result for TITLE
        title = result_en.get('title') if result_en else result_ar.get('title')
        original_title = result_en.get('original_title') if result_en else result_ar.get('original_title')
        
        # Use Arabic result for OVERVIEW, fallback to English
        overview = result_ar.get('overview')
        if not overview or len(overview) < 10: # If empty or too short
            overview = result_en.get('overview') if result_en else ''
            
        # Get trailer URL (Prefer English trailer usually, or Arabic if exists)
        trailer_url = None
        # Check English videos first for official trailers
        videos = result_en.get('videos', {}).get('results', []) if result_en else []
        if not videos:
            videos = result_ar.get('videos', {}).get('results', [])
        
        for video in videos:
            if video.get('type') == 'Trailer' and video.get('site') == 'YouTube':
                trailer_url = f"https://www.youtube.com/watch?v={video['key']}"
                break
        
        # Get genres (Arabic)
        genres = [g['name'] for g in result_ar.get('genres', [])]
        
        # Get runtime
        runtime = result_ar.get('runtime', 0)
        
        # Get country
        countries = [c['iso_3166_1'] for c in result_ar.get('production_countries', [])]
        country = countries[0] if countries else None
        
        # Get Collection
        collection = None
        if result_ar.get('belongs_to_collection'):
            c = result_ar['belongs_to_collection']
            collection = {
                'id': c['id'],
                'name': c['name'],
                'poster_path': c.get('poster_path'),
                'backdrop_path': c.get('backdrop_path')
            }

        # Extract certification (age rating) from release_dates
        certification = ''
        release_dates_data = result_en.get('release_dates', {}).get('results', []) if result_en else []
        if not release_dates_data:
            release_dates_data = result_ar.get('release_dates', {}).get('results', [])
        for r in release_dates_data:
            if r.get('iso_3166_1') == 'US':
                for rel in r.get('release_dates', []):
                    if rel.get('certification'):
                        certification = rel['certification']
                        break
                break

        # Extract logo from English images
        logo_url = None
        if result_en:
            logos = result_en.get('images', {}).get('logos', [])
            if logos:
                png_logos = [l for l in logos if l.get('file_path', '').endswith('.png')]
                best_logo = png_logos[0] if png_logos else logos[0]
                logo_url = f"{TMDB_IMAGE_BASE}/w500{best_logo['file_path']}"

        return {
            'tmdb_id': result_ar['id'],
            'title': title, # ENGLISH forced
            'original_title': original_title,
            'overview': overview, # ARABIC preferred
            'poster_url': f"{TMDB_IMAGE_BASE}/w500{result_ar.get('poster_path') or result_en.get('poster_path')}" if (result_ar.get('poster_path') or result_en.get('poster_path')) else None,
            'backdrop_url': f"{TMDB_IMAGE_BASE}/original{result_ar.get('backdrop_path') or result_en.get('backdrop_path')}" if (result_ar.get('backdrop_path') or result_en.get('backdrop_path')) else None,
            'logo_url': logo_url,
            'year': int(result_ar['release_date'][:4]) if result_ar.get('release_date') else None,
            'runtime': runtime,
            'country': country,
            'collection': collection,
            'genres': ','.join(genres),
            'tmdb_rating': result_ar.get('vote_average', 0),
            'imdb_id': result_ar.get('imdb_id'),
            'trailer_url': trailer_url,
            'certification': certification,
        }
    
    def _format_tv_metadata(self, result_ar: dict, result_en: dict) -> dict:
        """Format TV series metadata with STRICT language rules"""
        # Always use English result for TITLE
        title = result_en.get('name') if result_en else result_ar.get('name')
        original_title = result_en.get('original_name') if result_en else result_ar.get('original_name')

        # Use Arabic result for OVERVIEW, fallback to English
        overview = result_ar.get('overview')
        if not overview or len(overview) < 10:
             overview = result_en.get('overview') if result_en else ''

        # Get trailer URL
        trailer_url = None
        # Check English videos first
        videos = result_en.get('videos', {}).get('results', []) if result_en else []
        if not videos:
            videos = result_ar.get('videos', {}).get('results', [])
        
        for video in videos:
            if video.get('type') in ['Trailer', 'Teaser'] and video.get('site') == 'YouTube':
                trailer_url = f"https://www.youtube.com/watch?v={video['key']}"
                break
        
        genres = [g['name'] for g in result_ar.get('genres', [])]
        
        # Get country
        countries = result_ar.get('origin_country', [])
        country = countries[0] if countries else None

        # Get runtime (Average of episode runtimes)
        run_times = result_ar.get('episode_run_time', [])
        current_runtime = 0
        if run_times:
             current_runtime = int(sum(run_times) / len(run_times))
        
        # Fallback 1: Last Episode to Air
        if current_runtime == 0 and result_ar.get('last_episode_to_air'):
            current_runtime = result_ar['last_episode_to_air'].get('runtime', 0)
            
        # Fallback 2: Next Episode to Air
        if current_runtime == 0 and result_ar.get('next_episode_to_air'):
             current_runtime = result_ar['next_episode_to_air'].get('runtime', 0)

        # Fallback 3: Check English Result
        if current_runtime == 0 and result_en:
             run_times_en = result_en.get('episode_run_time', [])
             if run_times_en:
                 current_runtime = int(sum(run_times_en) / len(run_times_en))
        
        # Extract certification (age rating) from content_ratings
        certification = ''
        content_ratings = result_ar.get('content_ratings', {}).get('results', [])
        for r in content_ratings:
            if r.get('iso_3166_1') == 'US':
                certification = r.get('rating', '')
                break

        # Extract logo from English images
        logo_url = None
        if result_en:
            logos = result_en.get('images', {}).get('logos', [])
            if logos:
                # Prefer PNG logos, then any
                png_logos = [l for l in logos if l.get('file_path', '').endswith('.png')]
                best_logo = png_logos[0] if png_logos else logos[0]
                logo_url = f"{TMDB_IMAGE_BASE}/w500{best_logo['file_path']}"

        return {
            'tmdb_id': result_ar['id'],
            'title': title, # ENGLISH forced
            'original_title': original_title,
            'overview': overview, # ARABIC preferred
            'poster_url': f"{TMDB_IMAGE_BASE}/w500{result_ar.get('poster_path') or result_en.get('poster_path')}" if (result_ar.get('poster_path') or result_en.get('poster_path')) else None,
            'backdrop_url': f"{TMDB_IMAGE_BASE}/original{result_ar.get('backdrop_path') or result_en.get('backdrop_path')}" if (result_ar.get('backdrop_path') or result_en.get('backdrop_path')) else None,
            'logo_url': logo_url,
            'year': int(result_ar['first_air_date'][:4]) if result_ar.get('first_air_date') else None,
            'country': country,
            'genres': ','.join(genres),
            'tmdb_rating': result_ar.get('vote_average', 0),
            'total_seasons': result_ar.get('number_of_seasons', 1),
            'total_episodes': result_ar.get('number_of_episodes', 0),
            'status': result_ar.get('status', ''),
            'trailer_url': trailer_url,
            'seasons': result_ar.get('seasons', []),
            'runtime': current_runtime,
            'certification': certification,
        }
    
    def download_image(self, url: str, image_type: str = 'poster') -> Optional[str]:
        """Download and optimize image using AssetManager"""
        from asset_manager import asset_manager
        return asset_manager.download_and_optimize(url, image_type)
    
    def cache_images(self, metadata: dict) -> dict:
        """Download and cache poster/backdrop images, update URLs to local paths"""
        if metadata.get('poster_url'):
            local_poster = self.download_image(metadata['poster_url'], 'poster')
            if local_poster:
                metadata['poster_local'] = local_poster
                # Replace external URL with local API path for offline support
                metadata['poster_url'] = f"/api/images/{local_poster}"
        
        if metadata.get('backdrop_url'):
            local_backdrop = self.download_image(metadata['backdrop_url'], 'backdrop')
            if local_backdrop:
                metadata['backdrop_local'] = local_backdrop
                # Replace external URL with local API path for offline support
                metadata['backdrop_url'] = f"/api/images/{local_backdrop}"
        
        return metadata


    def get_recommendations(self, tmdb_id: int, media_type: str, limit: int = 12) -> List[dict]:
        """Get recommendations for a movie or TV show"""
        if not tmdb_id: return []
        
        # Normalize media type
        if media_type == 'series': media_type = 'tv'
        
        endpoint = f"/{media_type}/{tmdb_id}/recommendations"
        data = self._make_request(endpoint, {'language': 'en-US'}) 
        
        # Fallback to similar if no recommendations
        if not data or not data.get('results'):
             # Try 'similar' endpoint
             endpoint = f"/{media_type}/{tmdb_id}/similar"
             data = self._make_request(endpoint, {'language': 'en-US'})

        recommendations = []
        if data and 'results' in data:
            # Iterate through MORE results to ensure we fill the limit after filtering
            for item in data['results']: 
                # MAX Limit Safety (e.g. 20)
                if len(recommendations) >= limit:
                    break
                    
                # Filter items with missing poster
                if not item.get('poster_path'): continue
                
                title = item.get('title') if media_type == 'movie' else item.get('name')
                date = item.get('release_date') if media_type == 'movie' else item.get('first_air_date')
                
                # Fetch detailed runtime if possible (requires extra API call, so maybe just use basic info for now)
                # But backdrop is available in results
                backdrop_path = item.get('backdrop_path')
                
                recommendations.append({
                    'tmdb_id': item['id'],
                    'title': title,
                    'year': int(date[:4]) if date else None,
                    'poster_url': f"{TMDB_IMAGE_BASE}/w342{item['poster_path']}",
                    'backdrop_url': f"{TMDB_IMAGE_BASE}/w780{backdrop_path}" if backdrop_path else None,
                    'vote_average': item.get('vote_average'),
                    'type': media_type if media_type == 'movie' else 'series',
                    'runtime': None # Runtime requires individual details fetch which might be too slow for list
                })
        
        return recommendations

    def fetch_and_save_cast(self, media_id: int, tmdb_id: int, media_type: str, limit: int = 100) -> int:
        """Fetch cast from TMDb and save to cast_members/media_cast tables
        Downloads and caches actor profile images locally
        
        Args:
            media_id: Local database media ID
            tmdb_id: TMDb ID of the movie/series
            media_type: 'movie' or 'series'
            limit: Maximum number of cast members to save
        
        Returns:
            Number of cast members saved
        """
        from cast_api import save_cast_member, link_cast_to_media
        from asset_manager import AssetManager
        
        if not tmdb_id:
            return 0
        
        # Normalize type for TMDb API
        tmdb_type = 'tv' if media_type == 'series' else 'movie'
        
        # Fetch credits from TMDb
        credits_data = self._make_request(f'/{tmdb_type}/{tmdb_id}/credits')
        if not credits_data:
            return 0
        
        cast_list = credits_data.get('cast', [])[:limit]
        crew_list = credits_data.get('crew', [])
        
        # Filter crew for specific roles
        target_jobs = {'Director', 'Writer', 'Screenplay', 'Producer'}
        filtered_crew = [c for c in crew_list if c.get('job') in target_jobs][:20]
        
        members_to_process = []
        for idx, c in enumerate(cast_list):
            members_to_process.append({
                'id': c.get('id'),
                'name': c.get('name'),
                'profile_path': c.get('profile_path'),
                'character': c.get('character'),
                'role': 'Actor',
                'department': 'Acting',
                'order': idx
            })
            
        for idx, c in enumerate(filtered_crew):
            members_to_process.append({
                'id': c.get('id'),
                'name': c.get('name'),
                'profile_path': c.get('profile_path'),
                'character': None,
                'role': c.get('job'),
                'department': c.get('department', 'Crew'),
                'order': len(cast_list) + idx
            })

        saved_count = 0
        asset_manager = AssetManager()
        
        for member_data in members_to_process:
            try:
                tmdb_person_id = member_data.get('id')
                name = member_data.get('name')
                profile_path = member_data.get('profile_path')
                character = member_data.get('character')
                role = member_data.get('role', 'Actor')
                department = member_data.get('department', 'Acting')
                order = member_data.get('order', 0)
                
                if not tmdb_person_id or not name:
                    continue
                
                # Download and cache profile image if available
                local_profile_path = None
                if profile_path:
                    try:
                        profile_url = f"https://image.tmdb.org/t/p/w185{profile_path}"
                        local_profile_path = asset_manager.download_and_optimize(
                            url=profile_url,
                            type='poster'
                        )
                        # Use the TMDb path format for consistency, but image is cached
                        local_profile_path = profile_path  
                    except Exception as e:
                        _log('WARN', f"Failed to cache profile image for {name}: {e}")
                
                # Save cast member (will update if exists)
                person_id = save_cast_member(
                    tmdb_person_id=tmdb_person_id,
                    name=name,
                    profile_path=local_profile_path or profile_path
                )
                
                if person_id:
                    # Link cast to media
                    link_cast_to_media(
                        media_id=media_id,
                        person_id=person_id,
                        character_name=character,
                        cast_order=order,
                        role=role,
                        department=department
                    )
                    saved_count += 1
                    
            except Exception as e:
                _log('ERROR', f"Error saving cast member {member_data.get('name')}: {e}")
                continue
        
        return saved_count

def fetch_metadata_for_media(media_item: dict) -> dict:
    """Convenience function to fetch metadata for a media item"""
    fetcher = MetadataFetcher()
    
    title = media_item.get('title', '')
    year = media_item.get('year')
    media_type = media_item.get('type', 'movie')
    
    if media_type in ('movie',):
        return fetcher.search_movie(title, year) or {}
    elif media_type in ('series', 'episode'):
        return fetcher.search_tv(title) or {}
    
    return {}


if __name__ == '__main__':
    # Test the fetcher
    fetcher = MetadataFetcher()
    
    # Test movie search
    print("Searching for 'The Accountant'...")
    result = fetcher.search_movie('The Accountant', 2016)
    if result:
        print(f"  Title: {result['title']}")
        print(f"  Rating: {result['tmdb_rating']}")
        print(f"  Poster: {result['poster_url']}")
    else:
        print("  No API key set or no results")
    
    # Test TV search
    print("\nSearching for 'Black Mirror'...")
    result = fetcher.search_tv('Black Mirror')
    if result:
        print(f"  Title: {result['title']}")
        print(f"  Seasons: {result['total_seasons']}")
    else:
        print("  No API key set or no results")
