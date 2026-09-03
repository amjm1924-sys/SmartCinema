"""
Session Logger Module for SmartCinema (Full-Stack Logging)
Creates dedicated session log files in the `logs/` directory for each server/user session.
Captures both Backend (Flask, DB, FFmpeg, Python errors) and Frontend (React errors, API failures).
"""
import os
import sys
import time
import logging
import traceback
from datetime import datetime

# Root logs directory: SmartCinema/logs/
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LOGS_DIR = os.path.join(BASE_DIR, 'logs')

os.makedirs(LOGS_DIR, exist_ok=True)

# Generate unique session filename based on startup timestamp
SESSION_TIMESTAMP = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
SESSION_LOG_PATH = os.path.join(LOGS_DIR, f'session_{SESSION_TIMESTAMP}.log')
LATEST_LOG_PATH = os.path.join(LOGS_DIR, 'latest_session.log')

class FullStackSessionLogger:
    def __init__(self):
        self.session_log_path = SESSION_LOG_PATH
        self.latest_log_path = LATEST_LOG_PATH
        self._init_session_file()
        self._setup_logging_handlers()

    def _init_session_file(self):
        """Initialize the new session log file with header info"""
        header = f"""================================================================================
SMARTCINEMA FULL-STACK SESSION LOG
Session ID / Timestamp : {SESSION_TIMESTAMP}
Log File               : {self.session_log_path}
Start Time             : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
================================================================================
"""
        with open(self.session_log_path, 'w', encoding='utf-8') as f:
            f.write(header)
        
        # Update latest_session.log link/file
        try:
            with open(self.latest_log_path, 'w', encoding='utf-8') as f:
                f.write(header)
        except Exception:
            pass

    def _append_line(self, line: str):
        """Thread-safe append line to current session log, latest_session.log, AND stdout (CMD)"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
        formatted = f"[{timestamp}] {line}\n"
        
        # Print to CMD / terminal (stdout)
        try:
            sys.__stdout__.write(formatted)
            sys.__stdout__.flush()
        except Exception:
            pass
        
        # Write to session log file
        try:
            with open(self.session_log_path, 'a', encoding='utf-8') as f:
                f.write(formatted)
        except Exception as e:
            print(f"[SessionLogger Error] Could not write to session log: {e}")

        # Write to latest_session.log
        try:
            with open(self.latest_log_path, 'a', encoding='utf-8') as f:
                f.write(formatted)
        except Exception:
            pass

    def _setup_logging_handlers(self):
        """Attach session log file handler AND console handler to Python root logger"""
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.INFO)

        # File handler for session log
        file_handler = logging.FileHandler(self.session_log_path, encoding='utf-8')
        file_handler.setLevel(logging.INFO)
        formatter = logging.Formatter('[%(levelname)s] [%(name)s] %(message)s')
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

        # Console handler for CMD output
        console_handler = logging.StreamHandler(sys.__stdout__)
        console_handler.setLevel(logging.INFO)
        console_formatter = logging.Formatter('[%(levelname)s] [%(name)s] %(message)s')
        console_handler.setFormatter(console_formatter)
        root_logger.addHandler(console_handler)

    def log_backend(self, level: str, message: str, exc: Exception = None):
        """Log a backend event or error"""
        tag = f"[BACKEND] [{level.upper()}]"
        log_line = f"{tag} {message}"
        if exc:
            tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
            log_line += f"\n[BACKEND-STACKTRACE]\n{tb.strip()}"
        self._append_line(log_line)

    def log_frontend(self, level: str, message: str, url: str = None, user_agent: str = None):
        """Log a frontend event or React error received from client"""
        tag = f"[FRONTEND] [{level.upper()}]"
        meta = []
        if url:
            meta.append(f"URL: {url}")
        if user_agent:
            meta.append(f"UA: {user_agent}")
        meta_str = f" ({' | '.join(meta)})" if meta else ""
        self._append_line(f"{tag}{meta_str} {message}")

    def log_request(self, method: str, path: str, status_code: int, duration_ms: float, client_ip: str = None):
        """Log an HTTP request summary"""
        level = "ERROR" if status_code >= 500 else "WARN" if status_code >= 400 else "INFO"
        ip_str = f" [{client_ip}]" if client_ip else ""
        message = f"{method} {path} -> {status_code} ({duration_ms:.1f}ms){ip_str}"
        self._append_line(f"[HTTP] [{level}] {message}")

# Singleton Instance
session_logger = FullStackSessionLogger()
