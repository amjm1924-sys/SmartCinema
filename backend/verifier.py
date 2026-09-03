"""
Multi-source verification for media type detection.
Combines TMDb, Google Search, and IMDb to accurately determine if content is a Series or Movie.
"""
import requests
import time
from typing import Optional, Dict
from functools import lru_cache

class MultiSourceVerifier:
    """Verifies media type using multiple sources"""
    
    def __init__(self):
        self.cache = {}
        
    @lru_cache(maxsize=1000)
    def verify_media_type(self, title: str) -> str:
        """
        Verify if title is a Series or Movie using multiple sources.
        Returns: 'series', 'movie', or 'unknown'
        """
        if not title or len(title) < 2:
            return 'unknown'
        
        # Clean title
        clean_title = title.strip()
        
        # Check cache first
        if clean_title in self.cache:
            return self.cache[clean_title]
        
        # Google search verification
        google_result = self._google_search_verify(clean_title)
        
        # Cache and return
        self.cache[clean_title] = google_result
        return google_result
    
    def _google_search_verify(self, title: str) -> str:
        """
        Use Google search to verify media type via IMDb.
        Searches: "{title} site:imdb.com" and analyzes results.
        """
        try:
            # Construct search query
            query = f'"{title}" site:imdb.com'
            search_url = f"https://www.google.com/search?q={requests.utils.quote(query)}"
            
            # Simple user agent
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            
            # Brief delay to avoid rate limits
            time.sleep(0.5)
            
            response = requests.get(search_url, headers=headers, timeout=5)
            
            if response.status_code == 200:
                content = response.text.lower()
                
                # Check for TV series indicators
                tv_indicators = [
                    'tv series', 'television series', 'tv show',
                    'imdb.com/title/tt', '/episodes',
                    'season', 'episode'
                ]
                
                movie_indicators = [
                    'imdb.com/title/tt', '(film)', 'movie',
                ]
                
                tv_score = sum(1 for ind in tv_indicators if ind in content)
                movie_score = sum(1 for ind in movie_indicators if ind in content)
                
                # Decision logic
                if tv_score > movie_score + 1:  # Higher confidence threshold for TV
                    return 'series'
                elif movie_score > tv_score:
                    return 'movie'
                    
        except Exception as e:
            # Silent failure - return unknown
            pass
        
        return 'unknown'
    
    def get_confidence_score(self, title: str, tmdb_movie: bool, tmdb_tv: bool) -> Dict:
        """
        Calculate confidence score combining TMDb and Google verification.
        Returns: {'type': 'series'|'movie'|'unknown', 'confidence': 0-100}
        """
        google_result = self.verify_media_type(title)
        
        confidence = 50  # Base confidence
        final_type = 'unknown'
        
        # Both sources agree on series
        if google_result == 'series' and tmdb_tv and not tmdb_movie:
            final_type = 'series'
            confidence = 95
        # Both sources agree on movie
        elif google_result == 'movie' and tmdb_movie and not tmdb_tv:
            final_type = 'movie'
            confidence = 95
        # TMDb says series only
        elif tmdb_tv and not tmdb_movie:
            final_type = 'series'
            confidence = 80
        # TMDb says movie only
        elif tmdb_movie and not tmdb_tv:
            final_type = 'movie'
            confidence = 80
        # Google says series (TMDb ambiguous)
        elif google_result == 'series':
            final_type = 'series'
            confidence = 70
        # Google says movie (TMDb ambiguous)
        elif google_result == 'movie':
            final_type = 'movie'
            confidence = 70
            
        return {'type': final_type, 'confidence': confidence}
