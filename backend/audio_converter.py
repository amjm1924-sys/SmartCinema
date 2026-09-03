import os
import stat
import shutil
import threading
import time
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from ffmpeg_utils import get_video_info

MAX_WORKERS = 50  # Maximum number of concurrent FFmpeg processes


def _safe_replace_file(old_file_path, tmp_output_path):
    """
    Safely removes old_file_path (handling read-only flags and locked handles with retries)
    and moves tmp_output_path to old_file_path's base with .mp4 extension.
    Also updates database record if present.
    """
    base_no_ext = os.path.splitext(old_file_path)[0]
    final_path = base_no_ext + ".mp4"

    # 1. Clear Read-Only attribute on old file if present
    try:
        os.chmod(old_file_path, stat.S_IWRITE)
    except Exception:
        pass

    # 2. Clear Read-Only attribute on final_path if it exists
    if os.path.exists(final_path) and final_path != old_file_path:
        try:
            os.chmod(final_path, stat.S_IWRITE)
            os.remove(final_path)
        except Exception:
            pass

    # 3. Retry loop for removing old file (handles temporary file locks)
    max_retries = 5
    removed = False
    for attempt in range(max_retries):
        try:
            if os.path.exists(old_file_path):
                os.remove(old_file_path)
            removed = True
            break
        except PermissionError as pe:
            print(f"[AudioConverter] Retry {attempt + 1}/{max_retries} clearing read-only/lock for {old_file_path}: {pe}")
            try:
                os.chmod(old_file_path, stat.S_IWRITE)
            except Exception:
                pass
            time.sleep(1.0)
        except Exception as e:
            print(f"[AudioConverter] Error removing {old_file_path}: {e}")
            time.sleep(0.5)

    if not removed and os.path.exists(old_file_path):
        # Fallback: try os.replace directly
        try:
            os.replace(tmp_output_path, final_path)
            removed = True
        except Exception as e:
            raise PermissionError(f"Could not remove or replace original file {old_file_path} after retries: {e}")

    # 4. Rename/move temporary output file to final_path
    if os.path.exists(tmp_output_path):
        try:
            os.chmod(tmp_output_path, stat.S_IWRITE)
        except Exception:
            pass
        if os.path.exists(final_path) and final_path != tmp_output_path:
            try:
                os.chmod(final_path, stat.S_IWRITE)
                os.remove(final_path)
            except Exception:
                pass
        shutil.move(tmp_output_path, final_path)

    # 5. Update database record if file_path changed
    if old_file_path != final_path:
        try:
            from database import get_connection
            with get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("UPDATE media SET file_path = ?, format = 'mp4' WHERE file_path = ?", (final_path, old_file_path))
                conn.commit()
        except Exception as dbe:
            print(f"[AudioConverter] DB update warning for {final_path}: {dbe}")

    return final_path

class AudioConverterService:
    def __init__(self):
        self._lock = threading.Lock()
        self.is_running = False
        self.should_cancel = False
        self.current_folder = None
        
        # Stats for current scan/run
        self.total_files = 0
        self.processed_files = 0
        self.current_file = ""
        
        # Active progress map: { file_path: { 'progress': 0.0, 'eta': 0 } }
        self.active_progress_map = {}
        
        self.estimated_time_remaining = 0 # seconds
        self.start_time = 0
        
        self.unsupported_audio = ['eac3', 'ac3', 'dts', 'truehd']

    def start_conversion(self, folder_path):
        """Start conversion. folder_path can be a string or list of strings."""
        # Normalize to list
        if isinstance(folder_path, str):
            folders = [folder_path]
        elif isinstance(folder_path, list):
            folders = folder_path
        else:
            return {"error": "Invalid folder path type."}
        
        # Validate all paths
        valid_folders = [f for f in folders if os.path.exists(f)]
        if not valid_folders:
            return {"error": "No valid folder paths found."}

        with self._lock:
            if self.is_running:
                return {"error": "A conversion is already running."}

            self.is_running = True
            self.should_cancel = False
            self.current_folder = ', '.join(valid_folders) if len(valid_folders) > 1 else valid_folders[0]
            self._scan_folders = valid_folders
            self.total_files = 0
            self.processed_files = 0
            self.current_file = ""
            self.active_progress_map = {}
            self.estimated_time_remaining = 0
            self.start_time = time.time()
            
        thread = threading.Thread(target=self._run_conversion, daemon=True)
        thread.start()
        return {"success": True, "message": f"Audio conversion started for {len(valid_folders)} folder(s)."}

    def cancel_conversion(self):
        with self._lock:
            if not self.is_running:
                return {"error": "No conversion is currently running."}
            self.should_cancel = True
            return {"success": True, "message": "Cancellation requested."}

    def get_status(self):
        with self._lock:
            global_prog = 0
            current_file_prog = 0.0
            
            if self.total_files > 0:
                # Sum of completed files plus fractional progress of active files
                total_fractional_progress = sum(stats['progress'] / 100.0 for stats in self.active_progress_map.values())
                global_prog = ((self.processed_files + total_fractional_progress) / self.total_files) * 100.0
                
                # If there are active files, find the average progress to show on the main bar, 
                # or just use the first active file's progress. Let's average it for the UI.
                if self.active_progress_map:
                    current_file_prog = sum(stats['progress'] for stats in self.active_progress_map.values()) / len(self.active_progress_map)
                    
                    # Update global ETA based on the longest ETA among active files plus remaining queue estimation
                    # A better way: calculate overall items left
                    items_left = self.total_files - (self.processed_files + total_fractional_progress)
                    elapsed = time.time() - self.start_time
                    rate = (self.processed_files + total_fractional_progress) / elapsed if elapsed > 0 else 0
                    self.estimated_time_remaining = items_left / rate if rate > 0 else 0

            return {
                "is_running": self.is_running,
                "current_folder": self.current_folder,
                "total_files": self.total_files,
                "processed_files": self.processed_files,
                "current_file": self.current_file,
                "file_progress": round(current_file_prog, 1),
                "global_progress": round(global_prog, 1),
                "eta_seconds": int(self.estimated_time_remaining)
            }

    def _convert_single_file(self, file_path, duration, ffmpeg_path):
        if self.should_cancel:
            return False
            
        with self._lock:
            self.active_progress_map[file_path] = {'progress': 0.0, 'eta': 0}
            active_count = len(self.active_progress_map)
            self.current_file = f"Converting {active_count} files concurrently..."
            
        tmp_output = file_path + ".tmp.mp4"
        
        cmd = [
            ffmpeg_path,
            '-i', file_path,
            '-map', '0:v?',            # Explicitly take first video stream
            '-map', '0:a?',            # Explicitly take first audio stream
            '-c:v', 'copy',            # Copy video
            '-c:a', 'aac',             # Convert audio
            '-b:a', '192k',
            '-ac', '2',
            '-y',                      # Overwrite output
            tmp_output
        ]
        
        process = subprocess.Popen(cmd, stderr=subprocess.PIPE, universal_newlines=True, encoding='utf-8', errors='replace')
        import re
        time_regex = re.compile(r"time=(\d+):(\d+):(\d+.\d+)")
        
        start_conv_time = time.time()
        
        while True:
            line = process.stderr.readline()
            if not line and process.poll() is not None:
                break
                
            if duration > 0:
                match = time_regex.search(line)
                if match:
                    h, m, s = match.groups()
                    current_sec = int(h) * 3600 + int(m) * 60 + float(s)
                    prog = min(100.0, (current_sec / duration) * 100.0)
                    
                    elapsed = time.time() - start_conv_time
                    rate = current_sec / elapsed if elapsed > 0 else 0
                    remaining_sec = duration - current_sec
                    eta = remaining_sec / rate if rate > 0 else 0
                    
                    with self._lock:
                        if file_path in self.active_progress_map:
                            self.active_progress_map[file_path]['progress'] = prog
                            self.active_progress_map[file_path]['eta'] = int(eta)

            if self.should_cancel:
                process.terminate()
                break

        process.wait()
        
        success = False
        if not self.should_cancel and process.returncode == 0 and os.path.exists(tmp_output):
            try:
                _safe_replace_file(file_path, tmp_output)
                success = True
            except Exception as e:
                print(f"[AudioConverter] Error replacing file {file_path}: {e}")
                if os.path.exists(tmp_output):
                    try:
                        os.remove(tmp_output)
                    except Exception:
                        pass
        else:
            if os.path.exists(tmp_output):
                try:
                    os.remove(tmp_output)
                except Exception:
                    pass

        with self._lock:
            if file_path in self.active_progress_map:
                del self.active_progress_map[file_path]
            if success:
                self.processed_files += 1
            # Update current file message
            if len(self.active_progress_map) > 0:
                self.current_file = f"Converting {len(self.active_progress_map)} files concurrently..."
            else:
                self.current_file = "Waiting..."
                
        return success

    def _run_conversion(self):
        try:
            from ffmpeg_utils import get_ffmpeg_manager
            ffmpeg_path = get_ffmpeg_manager().get_ffmpeg_path()
            if not ffmpeg_path:
                print("[AudioConverter] Error: FFmpeg not found.")
                return

            # Scan files from all folders
            video_files = []
            scan_folders = getattr(self, '_scan_folders', [self.current_folder])
            for folder in scan_folders:
                for root, _, files in os.walk(folder):
                    for f in files:
                        if f.lower().endswith(('.mkv', '.mp4', '.avi', '.mov')):
                            video_files.append(os.path.join(root, f))
            
            with self._lock:
                self.total_files = len(video_files)
                self.current_file = "Scan complete. Analyzing audio codecs..."

            files_to_convert = []
            
            # Analyze
            for idx, file_path in enumerate(video_files):
                if self.should_cancel:
                    break
                
                with self._lock:
                    self.current_file = f"Analyzing: {os.path.basename(file_path)}"
                    self.processed_files = idx
                    
                info = get_video_info(file_path)
                if info and info.get('audio_codec'):
                    ac = info['audio_codec'].lower()
                    if any(x in ac for x in self.unsupported_audio):
                        files_to_convert.append((file_path, info.get('duration', 0)))
                        print(f"[AudioConverter] Needs conversion: {file_path} (Codec: {ac})")

            # Convert
            with self._lock:
                self.total_files = len(files_to_convert)
                self.processed_files = 0
                self.start_time = time.time() # Reset start time for actual conversion phase
                
            # Use ThreadPoolExecutor for concurrent conversions
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                futures = []
                for file_path, duration in files_to_convert:
                    if self.should_cancel:
                        break
                    futures.append(executor.submit(self._convert_single_file, file_path, duration, ffmpeg_path))
                
                for future in as_completed(futures):
                    # We can handle results here if needed
                    pass

        except Exception as e:
            print(f"[AudioConverter] Fatal error: {e}")
        finally:
            with self._lock:
                self.is_running = False
                self.current_file = "Canceled" if self.should_cancel else "Finished!"
                self.estimated_time_remaining = 0
                self.active_progress_map.clear()

# Singleton
converter_service = AudioConverterService()
