# Asset Manager for CinemaStream
# Handles downloading, resizing, and converting images to WebP

import os
import hashlib
import requests
from PIL import Image
from io import BytesIO
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Constants
IMAGES_DIR = Path(__file__).parent.parent / 'data' / 'images'
POSTER_WIDTH = 500
BACKDROP_WIDTH = 1280
QUALITY = 85

IMAGES_DIR.mkdir(parents=True, exist_ok=True)

class AssetManager:
    """Manages local asset downloading and optimization"""
    
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
    
    def download_and_optimize(self, url: str, type: str = 'poster') -> str:
        """
        Download image from URL, resize, convert to WebP, and save.
        Returns the local filename. Includes proxy fallbacks if the main TMDB domain fails.
        """
        if not url:
            return None
            
        # Create hash from original URL for unique filename
        url_hash = hashlib.md5(url.encode()).hexdigest()
        filename = f"{type}_{url_hash}.webp"
        file_path = IMAGES_DIR / filename
        
        # Return path if already exists
        if file_path.exists():
            return filename
            
        # Define proxies/mirrors for TMDB images
        fallbacks = [
            url,  # Original (e.g., https://image.tmdb.org/t/p/w500/...)
            url.replace('image.tmdb.org', 'wsrv.nl/?url=image.tmdb.org'), # Free image proxy
            url.replace('image.tmdb.org', 'image.themoviedb.org'), # Alternative domain
        ]
        
        for attempt, current_url in enumerate(fallbacks):
            try:
                # First attempt with STRICT SSL, subsequent attempts relaxed
                verify_ssl = (attempt == 0)
                
                if not verify_ssl:
                    import urllib3
                    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                
                response = self.session.get(current_url, timeout=10, verify=verify_ssl)
                response.raise_for_status()
                
                # Check if it actually returned an image
                if 'image' not in response.headers.get('Content-Type', ''):
                    logger.error(f"[AssetManager] URL returned non-image content: {current_url}")
                    continue
                
                # Open image
                try:
                    img = Image.open(BytesIO(response.content))
                    # Force image load to catch truncated files
                    img.load() 
                except Exception as img_e:
                    logger.error(f"[AssetManager] Invalid/Corrupt image data from {current_url}: {img_e}")
                    continue
                
                # Convert to RGB if necessary (e.g. RGBA/P)
                if img.mode in ('RGBA', 'P', 'LA'):
                    if img.mode == 'P' and 'transparency' in img.info:
                        img = img.convert('RGBA')
                    
                    background = Image.new('RGB', img.size, (0, 0, 0))
                    if img.mode == 'RGBA':
                        background.paste(img, mask=img.split()[3])
                    else:
                        background.paste(img)
                    img = background
                    
                # Resize logic
                target_width = POSTER_WIDTH if type == 'poster' else BACKDROP_WIDTH
                if img.width > target_width:
                    ratio = target_width / img.width
                    new_height = int(img.height * ratio)
                    img = img.resize((target_width, new_height), Image.Resampling.LANCZOS)
                    
                # Save as WebP
                img.save(file_path, 'WEBP', quality=QUALITY)
                logger.debug(f"[AssetManager] Downloaded '{type}' successfully -> {filename}")
                
                return filename
                
            except requests.exceptions.RequestException as req_e:
                logger.warning(f"[AssetManager] Request failed for {current_url} : {req_e}")
                import time
                time.sleep(1) # Small backoff between proxies
                continue
            except Exception as e:
                logger.error(f"[AssetManager] Image process crash on {current_url}: {e}")
                import time
                time.sleep(1)
                
        logger.error(f"[AssetManager] FATAL: All attempts failed for {url}")
        return None

# Global instance
asset_manager = AssetManager()
