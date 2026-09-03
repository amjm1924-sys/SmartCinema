import os
from pathlib import Path
from typing import Dict, List, Optional
from scanner import MediaScanner

class Renamer:
    def __init__(self):
        self.scanner = MediaScanner()

    def propose_names(self, file_paths: List[str]) -> List[Dict]:
        """
        Generate proposed new names for a list of files.
        Returns a list of dicts:
        {
            'original_path': str,
            'new_path': str, # Full path
            'original_name': str,
            'new_name': str,
            'type': 'movie' | 'episode' | 'unknown',
            'status': 'ready' | 'conflict' | 'error'
        }
        """
        proposals = []
        
        for path_str in file_paths:
            path = Path(path_str)
            if not path.exists() or not path.is_file():
                continue
                
            try:
                # 1. Provide Context for Accurate Parsing
                # We need folder context to detect Season/Series properly
                # Scanner's parse_media_file uses file_path.parent inside
                parsed = self.scanner.parse_media_file(path)
                
                original_name = path.name
                new_name = original_name 
                type_detected = parsed.get('type', 'unknown')
                
                # 2. Logic for Renaming
                if type_detected == 'episode':
                    # Pattern: Series Name - S01E02.ext
                    series_name = parsed.get('title', 'Unknown Series')
                    # Capitalize nicely
                    series_name = series_name.title()
                    
                    season = parsed.get('season_number', 1)
                    episode = parsed.get('episode_number', 1)
                    
                    ext = path.suffix.lower()
                    new_name = f"{series_name} - S{season:02d}E{episode:02d}{ext}"
                    
                elif type_detected == 'movie':
                    # Pattern: Movie Title (Year).ext
                    title = parsed.get('title', 'Unknown Movie')
                    year = parsed.get('year')
                    ext = path.suffix.lower()
                    
                    if year:
                        new_name = f"{title} ({year}){ext}"
                    else:
                        new_name = f"{title}{ext}"
            
                # 3. Conflict Detection
                new_full_path = path.parent / new_name
                status = 'ready'
                
                if new_full_path.exists() and new_full_path != path:
                    status = 'conflict'
                elif new_name == original_name:
                    status = 'unchanged'
                    
                proposals.append({
                    'original_path': str(path),
                    'new_path': str(new_full_path),
                    'original_name': original_name,
                    'new_name': new_name,
                    'type': type_detected,
                    'status': status
                })
                
            except Exception as e:
                proposals.append({
                    'original_path': str(path),
                    'new_path': str(path),
                    'original_name': path.name,
                    'new_name': path.name,
                    'type': 'error',
                    'status': f"Error: {str(e)}"
                })
                
        return proposals

    def execute_rename(self, operations: List[Dict]) -> List[Dict]:
        """
        Execute renaming operations.
        Expects a list of dicts with 'original_path' and 'new_path'.
        Returns list with 'result': 'success' | 'error'
        """
        results = []
        for op in operations:
            orig = Path(op['original_path'])
            dest = Path(op['new_path'])
            
            try:
                if not orig.exists():
                    op['result'] = 'error'
                    op['message'] = 'Source file not found'
                elif dest.exists() and dest != orig:
                    op['result'] = 'error'
                    op['message'] = 'Destination file already exists'
                else:
                    os.rename(orig, dest)
                    op['result'] = 'success'
            except Exception as e:
                op['result'] = 'error'
                op['message'] = str(e)
            
            results.append(op)
            
        return results
