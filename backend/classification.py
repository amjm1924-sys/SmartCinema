"""
Classification Service
Centralized logic for determining media type based on strict path rules.
"""
import re

def classify_media_type(file_path: str) -> str:
    """
    Determine if a file corresponds to a 'movie' or 'series' based on its path.
    ABSOLUTE RULE:
    - Path contains '/MOVIES/' (case-insensitive) -> 'movie'
    - Path contains '/SERIES/' (case-insensitive) -> 'series'
    - Otherwise -> 'unknown' (or fall back to other patterns if allowed, but strict mode prefers explicit)
    """
    normalized_path = file_path.replace('\\', '/').upper()
    
    if '/MOVIES/' in normalized_path or 'MOVIES/' in normalized_path:
        return 'movie'
    
    if '/SERIES/' in normalized_path or 'SERIES/' in normalized_path:
        return 'series'
        
    # Helper for root drives like "E:/MOVIES" where slash might be tricky depending on input
    if 'MOVIES' in normalized_path.split('/'):
        return 'movie'
    if 'SERIES' in normalized_path.split('/'):
        return 'series'

    return 'unknown'
