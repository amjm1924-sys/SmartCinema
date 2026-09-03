"""
Timeline Thumbnails Generator
Generates preview thumbnails for video timeline hover
Uses ProcessPoolExecutor with 12+ parallel ffmpeg workers for maximum speed
"""

import os
import subprocess
import shutil
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
from ffmpeg_utils import get_ffmpeg_manager


def _extract_single_frame(args):
    """
    Extract a single frame from video at given timestamp.
    This is a top-level function (required for ProcessPoolExecutor pickling).
    """
    ffmpeg_path, video_path, output_path, timestamp = args
    
    try:
        cmd = [
            ffmpeg_path,
            '-ss', str(timestamp),       # Fast seek BEFORE input
            '-i', video_path,
            '-vframes', '1',
            '-vf', 'scale=160:90',       # Tiny thumbnails
            '-q:v', '8',                 # Lower quality = much faster
            '-y',
            str(output_path)
        ]
        
        subprocess.run(
            cmd,
            capture_output=True,
            timeout=10,                  # Tight timeout per frame
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        
        if os.path.exists(output_path):
            return {
                'timestamp': timestamp,
                'url': None  # Will be filled by caller
            }
    except Exception:
        pass
    
    return None


class TimelineThumbnails:
    def __init__(self):
        self.ffmpeg = get_ffmpeg_manager()
        self.thumbnails_dir = Path(__file__).parent.parent / 'data' / 'thumbnails'
        self.thumbnails_dir.mkdir(parents=True, exist_ok=True)
        
    def generate_thumbnails(self, media_id: int, video_path: str, duration: int, interval: int = 10):
        """
        Generate thumbnails for video timeline using 12+ parallel ffmpeg processes.
        
        Args:
            media_id: Media ID
            video_path: Path to video file
            duration: Video duration in seconds
            interval: Interval between thumbnails in seconds
        
        Returns:
            dict: Thumbnail information
        """
        # Create media thumbnail directory
        media_thumb_dir = self.thumbnails_dir / str(media_id)
        media_thumb_dir.mkdir(exist_ok=True)
        
        num_thumbnails = max(1, int(duration // interval))
        expected_timestamps = [i * interval for i in range(num_thumbnails) if (i * interval) < duration]
        
        # Check if we already have most thumbnails to skip redundant generation
        existing_thumbs = list(media_thumb_dir.glob('*.jpg'))
        if len(existing_thumbs) >= len(expected_timestamps) * 0.9:
            print(f"Skipping thumb generation for {media_id}, {len(existing_thumbs)}/{len(expected_timestamps)} already exist.")
            thumbs_list = [
                {'timestamp': int(t.stem.split('_')[1]), 'url': f'/api/thumbnails/{media_id}/{t.name}'}
                for t in existing_thumbs if t.stem.split('_')[1].isdigit()
            ]
            
            return {
                'success': True,
                'count': len(thumbs_list),
                'interval': interval,
                'thumbnails': sorted(thumbs_list, key=lambda x: x['timestamp']),
                'cached': True
            }
        
        # Clear existing thumbnails completely (fast with shutil)
        if media_thumb_dir.exists():
            shutil.rmtree(media_thumb_dir, ignore_errors=True)
            media_thumb_dir.mkdir(exist_ok=True)
        
        try:
            ffmpeg_path = self.ffmpeg.ffmpeg_path
            if not ffmpeg_path:
                return {'success': False, 'error': 'FFmpeg not found'}
            
            # Build args list for all frames
            task_args = [
                (ffmpeg_path, video_path, str(media_thumb_dir / f'thumb_{ts}.jpg'), ts)
                for ts in expected_timestamps
            ]
            
            thumbnails = []
            
            # Use ProcessPoolExecutor with 12 workers for true parallel CPU execution
            # Each ffmpeg instance runs in its own process = no GIL contention
            max_workers = min(12, len(task_args))
            
            print(f"⚡ Generating {len(task_args)} thumbnails with {max_workers} parallel ffmpeg workers...")
            
            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(_extract_single_frame, args): args[3] for args in task_args}
                
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        ts = futures[future]
                        result['url'] = f'/api/thumbnails/{media_id}/thumb_{ts}.jpg'
                        thumbnails.append(result)
            
            print(f"✅ Generated {len(thumbnails)}/{len(task_args)} thumbnails for media {media_id}")
            
            return {
                'success': True,
                'count': len(thumbnails),
                'interval': interval,
                'thumbnails': sorted(thumbnails, key=lambda x: x['timestamp']),
                'cached': False
            }
            
        except Exception as e:
            print(f"Error generating thumbnails: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_thumbnail_at_time(self, media_id: int, timestamp: int):
        """Get closest thumbnail to given timestamp"""
        media_thumb_dir = self.thumbnails_dir / str(media_id)
        
        if not media_thumb_dir.exists():
            return None
        
        # Find closest thumbnail
        thumbnails = sorted(media_thumb_dir.glob('thumb_*.jpg'))
        if not thumbnails:
            return None
        
        closest = None
        min_diff = float('inf')
        
        for thumb in thumbnails:
            thumb_time = int(thumb.stem.split('_')[1])
            diff = abs(thumb_time - timestamp)
            
            if diff < min_diff:
                min_diff = diff
                closest = thumb
        
        return f'/api/thumbnails/{media_id}/{closest.name}' if closest else None
    
    def get_all_thumbnails(self, media_id: int):
        """Get all thumbnails for a media"""
        media_thumb_dir = self.thumbnails_dir / str(media_id)
        
        if not media_thumb_dir.exists():
            return []
        
        thumbnails = []
        for thumb in sorted(media_thumb_dir.glob('thumb_*.jpg')):
            timestamp = int(thumb.stem.split('_')[1])
            thumbnails.append({
                'timestamp': timestamp,
                'url': f'/api/thumbnails/{media_id}/{thumb.name}'
            })
        
        return thumbnails
    
    def delete_thumbnails(self, media_id: int):
        """Delete all thumbnails for a media"""
        media_thumb_dir = self.thumbnails_dir / str(media_id)
        
        if media_thumb_dir.exists():
            shutil.rmtree(media_thumb_dir, ignore_errors=True)
            print(f"🗑️ Deleted thumbnails for media {media_id}")

# Singleton instance
_timeline_thumbs = None

def get_timeline_thumbnails():
    global _timeline_thumbs
    if _timeline_thumbs is None:
        _timeline_thumbs = TimelineThumbnails()
    return _timeline_thumbs
