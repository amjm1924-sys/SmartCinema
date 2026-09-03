import time
import threading
from typing import Dict, List, Optional
from datetime import datetime

class ScanStatus:
    _instance = None
    _lock = threading.Lock()
    _condition = threading.Condition() # For notifying SSE clients

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(ScanStatus, cls).__new__(cls)
                    cls._instance._reset()
        return cls._instance

    def _reset(self):
        self.total_items = 0
        self.processed_movies = 0
        self.processed_series = 0
        self.processed_episodes = 0
        self.failed_items = 0
        self.current_file = ""
        self.start_time = 0.0
        self.is_scanning = False
        self.failed_files: List[Dict] = []  # List of {path, reason}
        self.last_update = 0.0

    def start_scan(self, total_estimation=0):
        with self._condition:
            self._reset()
            self.start_time = time.time()
            self.is_scanning = True
            self.total_items = total_estimation
            self._notify()

    def update_progress(self, file_name: str, item_type: str = 'unknown', status: str = 'processing'):
        with self._condition:
            self.current_file = file_name
            
            if status == 'completed':
                if item_type == 'movie':
                    self.processed_movies += 1
                elif item_type == 'series':
                    self.processed_series += 1
                elif item_type == 'episode':
                    self.processed_episodes += 1
            
            self._notify()

    def log_failure(self, file_path: str, reason: str):
        with self._condition:
            self.failed_items += 1
            self.failed_files.append({
                'file': file_path,
                'reason': reason,
                'time': datetime.now().isoformat()
            })
            self._notify()

    def finish_scan(self):
        with self._condition:
            self.is_scanning = False
            self.current_file = "Scan Complete"
            self._notify()

    def _notify(self):
        self.last_update = time.time()
        self._condition.notify_all()

    def get_snapshot(self) -> Dict:
        """Return a snapshot of the current status"""
        processed_total = self.processed_movies + self.processed_series + self.processed_episodes
        elapsed = time.time() - self.start_time if self.start_time > 0 else 0
        
        return {
            "is_scanning": self.is_scanning,
            "total_items": self.total_items,
            "processed_total": processed_total,
            "processed_movies": self.processed_movies,
            "processed_series": self.processed_series,
            "processed_episodes": self.processed_episodes,
            "failed_items": self.failed_items,
            "current_file": self.current_file,
            "start_time": self.start_time,
            "elapsed_seconds": elapsed,
            "failed_list": self.failed_files[-50:] # Return last 50 failures
        }

    def wait_for_update(self, timeout=None):
        """Block until an update occurs or timeout"""
        with self._condition:
            self._condition.wait(timeout)

scan_status = ScanStatus()
