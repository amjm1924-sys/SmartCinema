import os
import subprocess
from pathlib import Path
import shutil
import time

class Transcoder:
    """Handles media conversion using FFmpeg"""
    
    def __init__(self):
        self.ffmpeg_cmd = 'ffmpeg'
        self._check_ffmpeg()
        
    def _check_ffmpeg(self):
        """Check if ffmpeg is available in PATH or common locations"""
        # 1. Try global command
        try:
            subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
            self.ffmpeg_cmd = 'ffmpeg'
            self.available = True
            return
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass

        # 2. Try specific known paths
        known_paths = [
            r"C:\Program Files\Streamer\ffmpeg.exe",
            r"C:\ffmpeg\bin\ffmpeg.exe",
            r"ffmpeg.exe" # local directory
        ]

        for path in known_paths:
            if os.path.exists(path):
                self.ffmpeg_cmd = path
                self.available = True
                try:
                    self._log(f"FFmpeg found at: {path}")
                except:
                    pass
                return

        try:
            self._log("Warning: FFmpeg not found. Conversion features disabled.")
        except:
            pass
        self.available = False

    def _log(self, msg: str):
        try:
            print(msg)
        except UnicodeEncodeError:
            try:
                print(msg.encode('ascii', 'replace').decode('ascii'))
            except:
                pass

    def convert_to_mp4(self, input_path: str) -> str:
        """
        Convert to MP4 using GPU if available, otherwise CPU.
        Ensures H.264 video codec for browser compatibility.
        """
        if not self.available:
            return None

        input_path = Path(input_path)
        if not input_path.exists():
            return None

        output_path = input_path.with_suffix('.mp4')
        if output_path.exists():
            return str(output_path)

        self._log(f"Converting {input_path.name} to MP4 (H.264/AAC)...")
        
        # Try GPU Encoders in order: NVIDIA -> AMD -> Intel
        encoders = [
            ('h264_nvenc', '-c:v h264_nvenc -preset p4 -cq 23'), # NVIDIA
            ('h264_amf',   '-c:v h264_amf -quality balanced'),    # AMD
            ('h264_qsv',   '-c:v h264_qsv -global_quality 23'),   # Intel
            ('libx264',    '-c:v libx264 -preset veryfast -crf 23') # CPU Fallback
        ]

        # Common audio settings (AAC is required for web)
        audio_opts = '-c:a aac -b:a 192k'

        for enc_name, enc_cmd in encoders:
            try:
                self._log(f"Trying encoder: {enc_name}...")
                
                # Construct command
                # -map 0 : Map all streams
                # -movflags +faststart : Optimize for web streaming
                cmd_str = f'"{self.ffmpeg_cmd}" -y -i "{str(input_path)}" {enc_cmd} {audio_opts} -movflags +faststart "{str(output_path)}"'
                
                # We use shell=True here to handle the command string easily, checking return code
                result = subprocess.run(
                    cmd_str, 
                    shell=True,
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                    timeout=1800  # 30 min timeout for re-encoding
                )
                
                if result.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
                    self._log(f"Success with {enc_name}!")
                    return str(output_path)
                
                # If failed, log and try next
                # self._log(f"Encoder {enc_name} failed. Stderr: {result.stderr.decode('utf-8')[-500:]}")
                if output_path.exists():
                     os.remove(output_path)

            except Exception as e:
                self._log(f"Error with {enc_name}: {e}")
                if output_path.exists():
                    os.remove(output_path)
        
        self._log("All encoders failed.")
        return None

    def delete_original(self, input_path: str):
        """Safely delete the original file"""
        try:
            os.remove(input_path)
            self._log(f"Deleted original file: {input_path}")
        except Exception as e:
            self._log(f"Failed to delete original: {e}")
