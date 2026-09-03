import os
import subprocess
import threading
import time
import json
from datetime import datetime

# Backup configuration
SOURCE_DIR = r"C:\Users\01203\Downloads\CINEMA\SmartCinema"
TARGET_DIRS = [
    r"H:\SmartCinemax",
    r"E:\SmartCinemax"
]
EXCLUDE_DIRS = ['node_modules', '.git', '__pycache__', 'venv', '.venv']
CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'backup_config.json')

class BackupService:
    def __init__(self):
        self._lock = threading.Lock()
        self.is_running = False
        self.current_target = None
        self.progress_line = ""
        self.last_backup_time = None
        self.run_history = []
        
        self.load_config()
        
        # Start the automated daily backup daemon
        self.daemon_thread = threading.Thread(target=self._daily_daemon, daemon=True)
        self.daemon_thread.start()

    def load_config(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.last_backup_time = data.get('last_backup_time')
                    self.run_history = data.get('run_history', [])
            except Exception as e:
                print(f"[BackupService] Error loading config: {e}")

    def save_config(self):
        data = {
            'last_backup_time': self.last_backup_time,
            'run_history': self.run_history[-5:] # Keep last 5 runs
        }
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

    def _daily_daemon(self):
        """Runs once every 24 hours to trigger an auto-backup"""
        while True:
            # Check if 24 hours have passed since last backup
            should_run = False
            if not self.last_backup_time:
                should_run = True
            else:
                try:
                    last_time = datetime.fromisoformat(self.last_backup_time)
                    delta = datetime.now() - last_time
                    if delta.total_seconds() > 86400: # 24 hours
                        should_run = True
                except:
                    should_run = True
            
            if should_run and not self.is_running:
                print("[BackupService] Triggering daily automated backup...")
                # Run in a separate thread so daemon doesn't block
                threading.Thread(target=self._run_backup_job, daemon=True).start()
                
            # Sleep for an hour before checking again
            time.sleep(3600)

    def start_manual_backup(self):
        with self._lock:
            if self.is_running:
                return {"error": "Backup is already in progress."}
            self.is_running = True
            self.progress_line = "Initializing backup sequence..."
            
        thread = threading.Thread(target=self._run_backup_job, daemon=True)
        thread.start()
        return {"success": True, "message": "Backup started successfully."}

    def get_status(self):
        with self._lock:
            return {
                "is_running": self.is_running,
                "current_target": self.current_target,
                "progress_line": self.progress_line,
                "last_backup_time": self.last_backup_time,
                "history": self.run_history
            }

    def _run_backup_job(self):
        start_time = time.time()
        success_count = 0
        logs = []
        
        for target in TARGET_DIRS:
            with self._lock:
                self.current_target = target
                self.progress_line = f"Starting copy to {target}..."
            
            # Ensure target drive/path exists, or attempt creation (robocopy creates it, but it might fail if drive is unplugged)
            drive_letter = target[:2]
            if not os.path.exists(drive_letter):
                err = f"Drive {drive_letter} not accessible. Skipping."
                logs.append(err)
                print(f"[BackupService] {err}")
                continue
                
            import shutil
            
            # Step 1: Wipe destination completely first
            with self._lock:
                self.progress_line = f"Wiping target directory {target}..."
            try:
                # Use ignore_errors=True to forcefully bypass read-only files on Windows
                if os.path.exists(target):
                    shutil.rmtree(target, ignore_errors=True)
            except Exception as e:
                err = f"Failed to wipe {target}: {str(e)}"
                logs.append(err)
                print(f"[BackupService] {err}")
                continue # Skip backup to this target if wiping failed
                
            with self._lock:
                self.progress_line = f"Starting fresh copy to {target}..."
                
            # Step 2: Construct robust robocopy command for a fresh copy
            # /E    : Copy Subdirectories, including empty ones.
            # /MT:32 : Multithreading with 32 threads
            # /R:0 /W:0 : 0 Retries, 0 Wait seconds on failure to avoid hanging on locked files
            # /XD : Exclude directories
            # /NDL : No Directory List (keeps output clean)
            cmd = [
                'robocopy',
                SOURCE_DIR,
                target,
                '/E',
                '/MT:32',
                '/R:0',
                '/W:0',
                '/NDL',
                '/XD'
            ] + EXCLUDE_DIRS

            try:
                # Use subprocess to read output line by line for progress UI
                process = subprocess.Popen(
                    cmd, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.STDOUT, 
                    text=True, 
                    bufsize=1, # Line buffered
                    encoding='utf-8', 
                    errors='replace',
                    shell=True # Required for robocopy command resolution on Windows
                )
                
                while True:
                    line = process.stdout.readline()
                    if not line and process.poll() is not None:
                        break
                    if line.strip():
                        # Clean up robocopy output for the UI
                        clean_line = line.strip().replace('\t', ' ')
                        # Only show file names being copied, ignore summary headers
                        if '%' in clean_line or clean_line.startswith('New File') or clean_line.startswith('Older') or clean_line.startswith('Newer'):
                            with self._lock:
                                self.progress_line = clean_line[:100] + ('...' if len(clean_line) > 100 else '')

                process.wait()
                
                # Robocopy exit codes: 
                # 0 = No change
                # 1-7 = Success, something copied
                # 8+ = Failure
                if process.returncode < 8:
                    success_count += 1
                    logs.append(f"Success: {target}")
                else:
                    logs.append(f"Failed: {target} (Code: {process.returncode})")
                    
            except Exception as e:
                err = f"Exception copying to {target}: {str(e)}"
                logs.append(err)
                print(f"[BackupService] {err}")

        # Finalize
        with self._lock:
            self.is_running = False
            self.current_target = None
            self.progress_line = "Backup finished."
            self.last_backup_time = datetime.now().isoformat()
            
            # Record run history
            duration = round(time.time() - start_time, 1)
            self.run_history.append({
                "timestamp": self.last_backup_time,
                "duration_sec": duration,
                "targets_successful": success_count,
                "logs": logs
            })
            self.save_config()
            print(f"[BackupService] Backup cycle completed in {duration}s. Success: {success_count}/{len(TARGET_DIRS)}")

# Singleton instance
backup_service = BackupService()
