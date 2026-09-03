# FFmpeg Utilities for CinemaStream
# Dynamic FFmpeg detection and video information extraction

import os
import sys
import subprocess
import json
from pathlib import Path
from typing import Optional, Dict, Any


class FFmpegManager:
    """Manages FFmpeg detection and usage"""
    
    def __init__(self):
        self.ffmpeg_path = None
        self.ffprobe_path = None
        self._detect_ffmpeg()
    
    def _detect_ffmpeg(self):
        """Automatically detect FFmpeg installation"""
        # Common FFmpeg locations on Windows
        search_paths = [
            # Check in PATH first
            self._find_in_path('ffmpeg.exe'),
            self._find_in_path('ffprobe.exe'),
            
            # Common installation directories
            r'C:\ffmpeg\bin\ffmpeg.exe',
            r'C:\Program Files\ffmpeg\bin\ffmpeg.exe',
            r'C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe',
            
            # User's specific path (from original code)
            r'H:\ffmpeg-2025-08-20-git-4d7c609be3-full_build\bin\ffmpeg.exe',
            
            # Portable versions
            os.path.join(os.getcwd(), 'ffmpeg', 'bin', 'ffmpeg.exe'),
            os.path.join(os.path.dirname(__file__), '..', 'ffmpeg', 'bin', 'ffmpeg.exe'),
        ]
        
        for path in search_paths:
            if path and os.path.isfile(path):
                self.ffmpeg_path = path
                # Try to find ffprobe in the same directory
                probe_path = os.path.join(os.path.dirname(path), 'ffprobe.exe')
                if os.path.isfile(probe_path):
                    self.ffprobe_path = probe_path
                break
        
        if not self.ffmpeg_path:
            print("⚠️  Warning: FFmpeg not found. Video transcoding will not be available.")
            print("   Please install FFmpeg or set the path in settings.")
    
    def _find_in_path(self, executable: str) -> Optional[str]:
        """Search for executable in system PATH"""
        try:
            if sys.platform == 'win32':
                result = subprocess.run(
                    ['where', executable],
                    capture_output=True,
                    encoding='utf-8', 
                    errors='replace',
                    check=False
                )
                if result.returncode == 0 and result.stdout:
                    return result.stdout.strip().split('\n')[0]
            else:
                result = subprocess.run(
                    ['which', executable],
                    capture_output=True,
                    text=True,
                    check=False
                )
                if result.returncode == 0 and result.stdout:
                    return result.stdout.strip()
        except Exception:
            pass
        return None
    
    def is_available(self) -> bool:
        """Check if FFmpeg is available"""
        return self.ffmpeg_path is not None
    
    def get_ffmpeg_path(self) -> Optional[str]:
        """Get FFmpeg executable path"""
        return self.ffmpeg_path
    
    def get_ffprobe_path(self) -> Optional[str]:
        """Get FFprobe executable path"""
        return self.ffprobe_path
    
    def set_custom_path(self, ffmpeg_path: str):
        """Set custom FFmpeg path"""
        if os.path.isfile(ffmpeg_path):
            self.ffmpeg_path = ffmpeg_path
            # Try to find ffprobe in the same directory
            probe_path = os.path.join(os.path.dirname(ffmpeg_path), 'ffprobe.exe')
            if os.path.isfile(probe_path):
                self.ffprobe_path = probe_path
            return True
        return False
    
    def get_video_info(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Extract video information using ffprobe
        
        Returns:
            Dict with keys: duration, width, height, codec, bitrate, fps
        """
        if not self.ffprobe_path or not os.path.isfile(file_path):
            return None
        
        try:
            cmd = [
                self.ffprobe_path,
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                file_path
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                encoding='utf-8',
                errors='replace',
                check=False,
                timeout=30
            )
            
            if not result.stdout.strip():
                if result.stderr:
                    print(f"FFprobe empty stdout. Stderr: {result.stderr}")
                return None
                
            data = json.loads(result.stdout)
            
            # Extract video stream info
            video_stream = None
            audio_stream = None
            
            for stream in data.get('streams', []):
                if stream.get('codec_type') == 'video' and not video_stream:
                    video_stream = stream
                elif stream.get('codec_type') == 'audio' and not audio_stream:
                    audio_stream = stream
            
            if not video_stream:
                return None
            
            # Parse duration
            duration = None
            if 'duration' in data.get('format', {}):
                try:
                    duration = float(data['format']['duration'])
                except (ValueError, TypeError):
                    pass
            
            # Parse bitrate
            bitrate = None
            if 'bit_rate' in data.get('format', {}):
                try:
                    bitrate = int(data['format']['bit_rate'])
                except (ValueError, TypeError):
                    pass
            
            # Parse FPS
            fps = None
            if 'r_frame_rate' in video_stream:
                try:
                    num, den = video_stream['r_frame_rate'].split('/')
                    fps = int(num) / int(den) if int(den) != 0 else None
                except (ValueError, ZeroDivisionError):
                    pass
            
            return {
                'duration': duration,
                'width': video_stream.get('width'),
                'height': video_stream.get('height'),
                'codec': video_stream.get('codec_name'),
                'bitrate': bitrate,
                'fps': fps,
                'format': data.get('format', {}).get('format_name'),
                'size_bytes': int(data.get('format', {}).get('size', 0)),
                'has_audio': audio_stream is not None,
                'audio_codec': audio_stream.get('codec_name') if audio_stream else None
            }
            
        except subprocess.CalledProcessError as e:
            print(f"Error getting video info: {e}")
            if e.stderr:
                print(f"FFprobe stderr: {e.stderr}")
            return None
        except (subprocess.TimeoutExpired, json.JSONDecodeError, Exception) as e:
            print(f"Error getting video info: {e}")
            return None
    
    def verify_installation(self) -> Dict[str, Any]:
        """Verify FFmpeg installation and get version info"""
        if not self.ffmpeg_path:
            return {
                'available': False,
                'error': 'FFmpeg not found'
            }
        
        try:
            result = subprocess.run(
                [self.ffmpeg_path, '-version'],
                capture_output=True,
                encoding='utf-8',
                errors='replace',
                check=True,
                timeout=10
            )
            
            version_line = result.stdout.split('\n')[0]
            
            return {
                'available': True,
                'path': self.ffmpeg_path,
                'version': version_line,
                'ffprobe_available': self.ffprobe_path is not None
            }
            
        except Exception as e:
            return {
                'available': False,
                'error': str(e)
            }


# Global instance
_ffmpeg_manager = None

def get_ffmpeg_manager() -> FFmpegManager:
    """Get the global FFmpeg manager instance"""
    global _ffmpeg_manager
    if _ffmpeg_manager is None:
        _ffmpeg_manager = FFmpegManager()
    return _ffmpeg_manager


# Convenience functions
def find_ffmpeg() -> Optional[str]:
    """Find FFmpeg executable path"""
    return get_ffmpeg_manager().get_ffmpeg_path()


def get_video_info(file_path: str) -> Optional[Dict[str, Any]]:
    """Get video file information"""
    return get_ffmpeg_manager().get_video_info(file_path)


def is_ffmpeg_available() -> bool:
    """Check if FFmpeg is available"""
    return get_ffmpeg_manager().is_available()


if __name__ == '__main__':
    # Test the FFmpeg detection
    manager = get_ffmpeg_manager()
    
    info = manager.verify_installation()
    print("FFmpeg Detection Results:")
    print(json.dumps(info, indent=2))
    
    if info['available']:
        print(f"\n✅ FFmpeg found at: {info['path']}")
        print(f"   Version: {info['version']}")
        print(f"   FFprobe available: {info['ffprobe_available']}")
    else:
        print(f"\n❌ FFmpeg not found: {info.get('error', 'Unknown error')}")
