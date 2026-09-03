import os
import json
import time
import threading
import logging
from pathlib import Path

# Need to import inside functions to prevent circular imports if necessary
# from scanner import scan_library, is_scanning
# from database import get_library_paths

logger = logging.getLogger('auto_scanner')

class AutoScanner:
    def __init__(self, check_interval=20, debounce_interval=60):
        self.check_interval = check_interval
        self.debounce_interval = debounce_interval
        self.is_running = False
        self.thread = None
        self.scan_callback = None
        self.state_file = Path(__file__).parent.parent / 'data' / 'library_state.json'
        
        # Dictionary to track when a path was first modified
        # { 'path': timestamp }
        self.pending_scans = {}
        
        # Load previous state to avoid immediate rescan on boot if nothing changed
        self.current_state = self._load_state()

    def start(self, scan_callback):
        """Starts the background automatic scanner thread"""
        if self.is_running:
            return
            
        self.scan_callback = scan_callback
        self.is_running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        logger.info("Automatic Library Scanner started.")

    def stop(self):
        """Stops the background thread"""
        self.is_running = False
        if self.thread:
            self.thread.join(timeout=2.0)

    def _load_state(self):
        if self.state_file.exists():
            try:
                with open(self.state_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load library state: {e}")
        return {}

    def _save_state(self):
        try:
            os.makedirs(self.state_file.parent, exist_ok=True)
            with open(self.state_file, 'w', encoding='utf-8') as f:
                json.dump(self.current_state, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save library state: {e}")

    def _get_path_signature(self, directory):
        """
        Creates a signature for a directory based on file counts and modification times.
        Fast traversal using os.walk.
        """
        if not os.path.exists(directory):
            return {"exists": False, "count": 0, "mtime_sum": 0}
            
        file_count = 0
        mtime_sum = 0
        
        for root, _, files in os.walk(directory):
            for file in files:
                # Basic check for media files
                ext = os.path.splitext(file)[1].lower()
                if ext in ['.mp4', '.mkv', '.avi', '.srt', '.vtt']:
                    file_count += 1
                    try:
                        filepath = os.path.join(root, file)
                        mtime_sum += os.path.getmtime(filepath)
                    except OSError:
                        # File might have been deleted mid-scan
                        pass
                        
        return {"exists": True, "count": file_count, "mtime_sum": mtime_sum}

    def _run_loop(self):
        from database import get_library_paths
        from scan_status import scan_status as scan_manager
        
        def is_scanning():
            return scan_manager.get_snapshot()['is_scanning']

        while self.is_running:
            time.sleep(self.check_interval)
            
            # Don't do background stuff if a scan is already actively running
            if is_scanning():
                continue

            try:
                # 1. Fetch current configured paths
                paths_data = get_library_paths()
                active_paths = [p['path'] for p in paths_data if p.get('enabled', 1)]
                
                paths_changed = False
                
                # 2. Check each path for changes
                current_time = time.time()
                
                for path in active_paths:
                    abs_path = os.path.abspath(path)
                    sig = self._get_path_signature(abs_path)
                    
                    old_sig = self.current_state.get(abs_path)
                    
                    if old_sig != sig:
                        # Change detected!
                        if abs_path not in self.pending_scans:
                            logger.info(f"Change detected in {abs_path}. Waiting for debounce...")
                            self.pending_scans[abs_path] = current_time
                        
                        # Update state memory
                        self.current_state[abs_path] = sig
                        paths_changed = True
                        
                # Remove state for paths no longer configured
                stale_paths = [p for p in self.current_state.keys() if p not in [os.path.abspath(ap) for ap in active_paths]]
                if stale_paths:
                    for p in stale_paths:
                        del self.current_state[p]
                        if p in self.pending_scans:
                            del self.pending_scans[p]
                    paths_changed = True

                if paths_changed:
                    self._save_state()

                # 3. Process pending scans (Debounce check)
                paths_to_scan = []
                for p, first_detected_time in list(self.pending_scans.items()):
                    if current_time - first_detected_time >= self.debounce_interval:
                        paths_to_scan.append(p)
                        del self.pending_scans[p]

                # 4. Trigger isolated scan for the debounced paths
                if paths_to_scan and self.scan_callback and not is_scanning():
                    logger.info(f"Auto-triggering scan for modified paths: {paths_to_scan}")
                    formatted_paths = [{'path': p} for p in paths_to_scan]
                    # Start it in a detached thread so this loop doesn't block entirely
                    threading.Thread(target=self.scan_callback, args=(formatted_paths,), daemon=True).start()

            except Exception as e:
                import traceback
                logger.error(f"Error in automatic scanner loop: {e}")
                traceback.print_exc()

# Singleton instance
auto_scanner = AutoScanner()
