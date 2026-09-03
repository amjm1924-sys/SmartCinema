# Profiles Module for SmartCinema
# Handles user profile resolution by IP address groups
# Each profile has isolated watch history and favorites

from database import get_db

# Cache profile resolution to avoid DB lookups on every request
_ip_cache = {}

def resolve_profile(ip: str) -> int:
    """Resolve a client IP to a profile_id. Returns 1 (default) if unassigned."""
    # Check cache first
    if ip in _ip_cache:
        return _ip_cache[ip]

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT profile_id FROM profile_ip_map WHERE ip_address = ?', (ip,))
    row = cursor.fetchone()
    conn.close()

    profile_id = row['profile_id'] if row else 1
    _ip_cache[ip] = profile_id
    return profile_id

def invalidate_cache():
    """Clear the IP-to-profile cache (call after IP assignment changes)."""
    global _ip_cache
    _ip_cache = {}

def get_all_profiles() -> list:
    """Get all profiles with their assigned IPs."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM profiles ORDER BY id')
    profiles = []
    for row in cursor.fetchall():
        profile = dict(row)
        cursor.execute('SELECT ip_address FROM profile_ip_map WHERE profile_id = ?', (profile['id'],))
        profile['ips'] = [r['ip_address'] for r in cursor.fetchall()]
        profiles.append(profile)
    conn.close()
    return profiles

def get_profile_by_id(profile_id: int) -> dict:
    """Get a single profile by ID."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM profiles WHERE id = ?', (profile_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    profile = dict(row)
    cursor.execute('SELECT ip_address FROM profile_ip_map WHERE profile_id = ?', (profile_id,))
    profile['ips'] = [r['ip_address'] for r in cursor.fetchall()]
    conn.close()
    return profile

def create_profile(name: str, avatar_color: str = '#6366f1', default_audio_lang: str = 'auto', default_sub_lang: str = 'off') -> int:
    """Create a new profile. Returns new profile ID."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO profiles (name, avatar_color, default_audio_lang, default_sub_lang) VALUES (?, ?, ?, ?)',
        (name, avatar_color, default_audio_lang, default_sub_lang)
    )
    profile_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return profile_id

def update_profile(profile_id: int, name: str = None, avatar_color: str = None, avatar_url: str = None, default_audio_lang: str = None, default_sub_lang: str = None) -> bool:
    """Update profile name, color, avatar image, and language preferences."""
    conn = get_db()
    cursor = conn.cursor()

    updates = []
    params = []
    if name is not None:
        updates.append('name = ?')
        params.append(name)
    if avatar_color is not None:
        updates.append('avatar_color = ?')
        params.append(avatar_color)
    if avatar_url is not None:
        updates.append('avatar_url = ?')
        params.append(avatar_url)
    if default_audio_lang is not None:
        updates.append('default_audio_lang = ?')
        params.append(default_audio_lang)
    if default_sub_lang is not None:
        updates.append('default_sub_lang = ?')
        params.append(default_sub_lang)

    if not updates:
        conn.close()
        return False

    params.append(profile_id)
    cursor.execute(f'UPDATE profiles SET {", ".join(updates)} WHERE id = ?', params)
    conn.commit()
    conn.close()
    return True

def delete_profile(profile_id: int) -> bool:
    """Delete a profile. Cannot delete the default profile (ID=1).
    Reassigns orphaned history/favorites to default profile."""
    if profile_id == 1:
        return False

    conn = get_db()
    cursor = conn.cursor()

    # Reassign watch history to default profile, handling conflicts
    # Delete entries that would conflict (same media_id already exists in profile 1)
    cursor.execute('''
        DELETE FROM watch_history
        WHERE profile_id = ? AND media_id IN (
            SELECT media_id FROM watch_history WHERE profile_id = 1
        )
    ''', (profile_id,))
    cursor.execute('UPDATE watch_history SET profile_id = 1 WHERE profile_id = ?', (profile_id,))

    # Reassign favorites to default profile, handling conflicts
    cursor.execute('''
        DELETE FROM favorites
        WHERE profile_id = ? AND media_id IN (
            SELECT media_id FROM favorites WHERE profile_id = 1
        )
    ''', (profile_id,))
    cursor.execute('UPDATE favorites SET profile_id = 1 WHERE profile_id = ?', (profile_id,))

    # Delete IP mappings
    cursor.execute('DELETE FROM profile_ip_map WHERE profile_id = ?', (profile_id,))

    # Delete profile
    cursor.execute('DELETE FROM profiles WHERE id = ?', (profile_id,))
    conn.commit()
    conn.close()

    invalidate_cache()
    return True

def assign_ip(profile_id: int, ip_address: str) -> bool:
    """Assign an IP address to a profile. Moves it from any existing profile."""
    conn = get_db()
    cursor = conn.cursor()
    try:
        # Remove from any existing profile first
        cursor.execute('DELETE FROM profile_ip_map WHERE ip_address = ?', (ip_address,))
        # Assign to new profile
        cursor.execute(
            'INSERT INTO profile_ip_map (profile_id, ip_address) VALUES (?, ?)',
            (profile_id, ip_address)
        )
        conn.commit()
        invalidate_cache()
        return True
    except Exception as e:
        print(f"Error assigning IP {ip_address} to profile {profile_id}: {e}")
        return False
    finally:
        conn.close()

def remove_ip(ip_address: str) -> bool:
    """Remove an IP assignment (device goes back to default profile)."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM profile_ip_map WHERE ip_address = ?', (ip_address,))
    conn.commit()
    conn.close()
    invalidate_cache()
    return True

def get_profile_ips(profile_id: int) -> list:
    """Get all IPs assigned to a profile."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT ip_address FROM profile_ip_map WHERE profile_id = ?', (profile_id,))
    ips = [row['ip_address'] for row in cursor.fetchall()]
    conn.close()
    return ips
