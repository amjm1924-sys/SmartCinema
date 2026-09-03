# Database Module for CinemaStream
# Handles SQLite operations for media library and watch history

import sqlite3
import os
from datetime import datetime
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'cinemastream.db')

def init_db():
    """Initialize the database with required tables"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Media table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS media (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                original_title TEXT,
                type TEXT NOT NULL,
                file_path TEXT UNIQUE,
                folder_path TEXT,
                tmdb_id INTEGER,
                poster_url TEXT,
                backdrop_url TEXT,
                overview TEXT,
                genres TEXT,
                year INTEGER,
                tmdb_rating REAL,
                imdb_rating REAL,
                imdb_id TEXT,
                duration INTEGER,
                runtime INTEGER,
                country TEXT,
                quality TEXT,
                format TEXT,
                size_bytes INTEGER,
                trailer_url TEXT,
                certification TEXT,
                series_id INTEGER,
                season_number INTEGER,
                episode_number INTEGER,
                episode_title TEXT,
                total_episodes INTEGER,
                total_seasons INTEGER,
                hidden BOOLEAN DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                locked BOOLEAN DEFAULT 0,
                collection_tmdb_id INTEGER
            )
        """)
        
        # Migration: Add new columns if they don't exist (for existing databases)
        try:
            cursor.execute("ALTER TABLE media ADD COLUMN intro_start REAL")
            cursor.execute("ALTER TABLE media ADD COLUMN intro_end REAL")
            print("Migrated media table: Added intro columns")
        except sqlite3.OperationalError:
            try:
                # Try adding them individually if one failed (rare but possible)
                cursor.execute("ALTER TABLE media ADD COLUMN intro_start REAL")
            except: pass
            try:
                cursor.execute("ALTER TABLE media ADD COLUMN intro_end REAL")
            except: pass

        # Migration: Add outro columns
        try:
            cursor.execute("ALTER TABLE media ADD COLUMN outro_start REAL")
            cursor.execute("ALTER TABLE media ADD COLUMN outro_end REAL")
            print("Migrated media table: Added outro columns")
        except sqlite3.OperationalError:
            try:
                cursor.execute("ALTER TABLE media ADD COLUMN outro_start REAL")
            except: pass
            try:
                cursor.execute("ALTER TABLE media ADD COLUMN outro_end REAL")
            except: pass

        # Collections tables (Must be created BEFORE migration checks)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS collections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT DEFAULT 'manual',
                tmdb_id INTEGER UNIQUE,
                overview TEXT,
                poster_url TEXT,
                backdrop_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS collection_items (
                collection_id INTEGER NOT NULL,
                media_id INTEGER NOT NULL,
                display_order INTEGER DEFAULT 0,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (collection_id, media_id),
                FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
                FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
            )
        """)

        # IPTV tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS iptv_playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                enabled BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS iptv_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                logo TEXT,
                stream_url TEXT NOT NULL,
                group_title TEXT,
                FOREIGN KEY (playlist_id) REFERENCES iptv_playlists(id) ON DELETE CASCADE
            )
        """)

        try:
            cursor.execute("SELECT imdb_rating FROM media LIMIT 1")
        except:
            print("Migrating database: Adding IMDB rating column...")

            cursor.execute("ALTER TABLE media ADD COLUMN imdb_rating REAL")
        
        try:
            cursor.execute("SELECT imdb_id FROM media LIMIT 1")
        except:
            print("Migrating database: Adding IMDB ID column...")
            cursor.execute("ALTER TABLE media ADD COLUMN imdb_id TEXT")
        
        try:
            cursor.execute("SELECT certification FROM media LIMIT 1")
        except:
            print("Migrating database: Adding certification column...")
            cursor.execute("ALTER TABLE media ADD COLUMN certification TEXT")

        try:
            cursor.execute("SELECT updated_at FROM media LIMIT 1")
        except:
            print("Migrating database: Adding updated_at column...")
            # Split into ALTER + UPDATE to avoid "non-constant default" error in some SQLite versions
            cursor.execute("ALTER TABLE media ADD COLUMN updated_at TIMESTAMP")
            cursor.execute("UPDATE media SET updated_at = CURRENT_TIMESTAMP")
            conn.commit()

        try:
            cursor.execute("SELECT locked FROM media LIMIT 1")
        except:
            print("Migrating database: Adding locked column...")
            cursor.execute("ALTER TABLE media ADD COLUMN locked BOOLEAN DEFAULT 0")

        try:
            cursor.execute("SELECT original_title FROM media LIMIT 1")
        except:
            print("Migrating database: Adding original_title column...")
            cursor.execute("ALTER TABLE media ADD COLUMN original_title TEXT")

        try:
            cursor.execute("SELECT country FROM media LIMIT 1")
        except:
            print("Migrating database: Adding country column...")
            cursor.execute("ALTER TABLE media ADD COLUMN country TEXT")

        try:
            cursor.execute("SELECT runtime FROM media LIMIT 1")
        except:
            print("Migrating database: Adding runtime column...")
            cursor.execute("ALTER TABLE media ADD COLUMN runtime INTEGER")

        try:
            cursor.execute("SELECT tmdb_id FROM media LIMIT 1")
            # Ensure indices exist (Idempotent)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_tmdb_id ON media(tmdb_id)")
        except:
            pass # Column exists from create table, index handled below

        try:
            cursor.execute("SELECT collection_tmdb_id FROM media LIMIT 1")
        except:
            print("Migrating database: Adding collection_tmdb_id column...")
            cursor.execute("ALTER TABLE media ADD COLUMN collection_tmdb_id INTEGER")
            
        # Critical Indices for Performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_tmdb_id ON media(tmdb_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_media_collection_tmdb_id ON media(collection_tmdb_id)")

        # Migration: Add status column (Returning Series / Ended / Canceled)
        try:
            cursor.execute("SELECT status FROM media LIMIT 1")
        except:
            print("Migrating database: Adding status column...")
            cursor.execute("ALTER TABLE media ADD COLUMN status TEXT")

        # Migration: Add logo_url column 
        try:
            cursor.execute("SELECT logo_url FROM media LIMIT 1")
        except:
            print("Migrating database: Adding logo_url column...")
            cursor.execute("ALTER TABLE media ADD COLUMN logo_url TEXT")

        try:
            cursor.execute("SELECT tmdb_id FROM collections LIMIT 1")
        except:
            print("Migrating database: Adding tmdb_id and overview to collections...")
            cursor.execute("ALTER TABLE collections ADD COLUMN tmdb_id INTEGER")
            cursor.execute("ALTER TABLE collections ADD COLUMN overview TEXT")
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_tmdb_id ON collections(tmdb_id)")

        try:
            cursor.execute("SELECT poster_url FROM collections LIMIT 1")
        except:
            print("Migrating database: Adding poster_url and backdrop_url to collections...")
            cursor.execute("ALTER TABLE collections ADD COLUMN poster_url TEXT")
            cursor.execute("ALTER TABLE collections ADD COLUMN backdrop_url TEXT")

        
        # Watch history table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS watch_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                position REAL DEFAULT 0,
                duration REAL DEFAULT 0,
                progress_percent REAL DEFAULT 0,
                completed BOOLEAN DEFAULT 0,

                watch_count INTEGER DEFAULT 1,
                last_watched TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
            )
        """)
        
        try:
            cursor.execute("SELECT watch_count FROM watch_history LIMIT 1")
        except:
            print("Migrating database: Adding watch_count column...")
            cursor.execute("ALTER TABLE watch_history ADD COLUMN watch_count INTEGER DEFAULT 1")
        
        # Ensure UNIQUE index on media_id for ON CONFLICT support
        try:
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_history_media_id ON watch_history (media_id)")
        except Exception as e:
            print(f"Warning: Could not create index: {e}")
        
        # Library paths table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS library_paths (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                enabled BOOLEAN DEFAULT 1,
                last_scanned TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Hidden paths table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hidden_paths (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Favorites table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL UNIQUE,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
            )
        """)

        # Playlists tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS playlists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS playlist_items (
                playlist_id INTEGER NOT NULL,
                media_id INTEGER NOT NULL,
                order_num INTEGER DEFAULT 0,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (playlist_id, media_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
            )
        """)
        
        # Smart Search (FTS5)
        # Create virtual table for full-text search (Idempotent)
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS media_fts USING fts5(
                id UNINDEXED,
                title,
                overview,
                genres,
                content='media',
                content_rowid='id'
            )
        """)

        # Triggers to keep FTS index updated
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS media_ai AFTER INSERT ON media BEGIN
                INSERT INTO media_fts(rowid, id, title, overview, genres) 
                VALUES (new.id, new.id, new.title, new.overview, new.genres);
            END;
        """)
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS media_ad AFTER DELETE ON media BEGIN
                INSERT INTO media_fts(media_fts, rowid, id, title, overview, genres) 
                VALUES('delete', old.id, old.id, old.title, old.overview, old.genres);
            END;
        """)
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS media_au AFTER UPDATE ON media BEGIN
                INSERT INTO media_fts(media_fts, rowid, id, title, overview, genres) 
                VALUES('delete', old.id, old.id, old.title, old.overview, old.genres);
                INSERT INTO media_fts(rowid, id, title, overview, genres) 
                VALUES (new.id, new.id, new.title, new.overview, new.genres);
            END;
        """)
        
        # Populate FTS if empty (heuristic)
        cursor.execute("SELECT count(*) FROM media_fts")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO media_fts(rowid, id, title, overview, genres)
                SELECT id, id, title, overview, genres FROM media
            """)

        # Create indexes for better performance
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_type ON media(type)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_year ON media(year)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_genres ON media(genres)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_imdb_rating ON media(imdb_rating)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_tmdb_rating ON media(tmdb_rating)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_series_id ON media(series_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_series_season ON media(series_id, season_number)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_type_hidden ON media(type, hidden)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_watch_history_media ON watch_history(media_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_favorites_media ON favorites(media_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_locked ON media(locked)')
        cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_media_file_path_unique ON media(file_path)')
        
        # Cast tables for Cast Hub feature
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cast_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tmdb_person_id INTEGER UNIQUE,
                name TEXT NOT NULL,
                profile_path TEXT,
                biography TEXT,
                birthday TEXT,
                deathday TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS media_cast (
                media_id INTEGER NOT NULL,
                person_id INTEGER NOT NULL,
                character_name TEXT,
                cast_order INTEGER DEFAULT 0,
                role TEXT DEFAULT 'Actor',
                department TEXT DEFAULT 'Acting',
                PRIMARY KEY (media_id, person_id, role),
                FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE,
                FOREIGN KEY (person_id) REFERENCES cast_members(id) ON DELETE CASCADE
            )
        """)
        
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_media_cast_person ON media_cast(person_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_cast_members_tmdb ON cast_members(tmdb_person_id)')
        
        # Migration: Add role and department columns if they don't exist
        try:
            cursor.execute("SELECT role FROM media_cast LIMIT 1")
        except:
            print("Migrating database: Adding role and department columns to media_cast...")
            cursor.execute("ALTER TABLE media_cast ADD COLUMN role TEXT DEFAULT 'Actor'")
            cursor.execute("ALTER TABLE media_cast ADD COLUMN department TEXT DEFAULT 'Acting'")
            # Since primary key cannot be altered directly in SQLite, we just append the columns.

        # AI Feature Tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL,  -- 'gemini', 'groq', 'openai', etc.
                api_key TEXT NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                total_tokens_used INTEGER DEFAULT 0,
                quota_remaining INTEGER,
                first_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used TIMESTAMP,
                error_count INTEGER DEFAULT 0,
                notes TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ai_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt_hash TEXT UNIQUE NOT NULL,
                response TEXT NOT NULL,
                provider TEXT,
                tokens_used INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Migration: Add trailer_local column for cached trailers
        try:
            cursor.execute("SELECT trailer_local FROM media LIMIT 1")
        except:
            print("Migrating database: Adding trailer_local column...")
            cursor.execute("ALTER TABLE media ADD COLUMN trailer_local TEXT")

        # Migration: Add trailer_health column
        try:
             cursor.execute("SELECT trailer_health FROM media LIMIT 1")
        except:
             print("Migrating database: Adding trailer_health column...")
             # values: 'ok', 'error', 'geo_blocked', 'missing'
             cursor.execute("ALTER TABLE media ADD COLUMN trailer_health TEXT DEFAULT 'unknown'")
        
        # Migration: Add user_rating column for personal ratings
        try:
            cursor.execute("SELECT user_rating FROM media LIMIT 1")
        except:
            print("Migrating database: Adding user_rating column...")
            cursor.execute("ALTER TABLE media ADD COLUMN user_rating REAL")

        # Collections tables
        # Collections table already created above
        
        # ===== PROFILES SYSTEM =====
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                avatar_color TEXT DEFAULT '#6366f1',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS profile_ip_map (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_id INTEGER NOT NULL,
                ip_address TEXT UNIQUE NOT NULL,
                FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
            )
        """)

        # Ensure default profile exists
        cursor.execute("SELECT id FROM profiles WHERE id = 1")
        if not cursor.fetchone():
            cursor.execute("INSERT INTO profiles (id, name, avatar_color) VALUES (1, 'افتراضي', '#6366f1')")
            print("Created default profile (ID=1)")

        # Migration: Add default_audio_lang and default_sub_lang to profiles
        try:
            cursor.execute("SELECT default_audio_lang FROM profiles LIMIT 1")
        except Exception:
            try:
                cursor.execute("ALTER TABLE profiles ADD COLUMN default_audio_lang TEXT DEFAULT 'ara'")
                cursor.execute("ALTER TABLE profiles ADD COLUMN default_sub_lang TEXT DEFAULT 'ara'")
            except Exception: pass

        # Migration: Add profile_id to watch_history
        try:
            cursor.execute("SELECT profile_id FROM watch_history LIMIT 1")
        except:
            print("Migrating database: Adding profile_id to watch_history...")
            cursor.execute("ALTER TABLE watch_history ADD COLUMN profile_id INTEGER DEFAULT 1")
            # Drop old unique index and create new composite one
            try:
                cursor.execute("DROP INDEX IF EXISTS idx_history_media_id")
            except: pass
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_history_media_profile ON watch_history (media_id, profile_id)")

        # Migration: Add profile_id to favorites
        try:
            cursor.execute("SELECT profile_id FROM favorites LIMIT 1")
        except:
            print("Migrating database: Adding profile_id to favorites...")
            cursor.execute("ALTER TABLE favorites ADD COLUMN profile_id INTEGER DEFAULT 1")
            # Recreate unique constraint as composite
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_media_profile ON favorites (media_id, profile_id)")

        # Ensure composite indexes exist (idempotent)
        try:
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_history_media_profile ON watch_history (media_id, profile_id)")
        except: pass
        try:
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_media_profile ON favorites (media_id, profile_id)")
        except: pass

        # Migration: Add avatar_url column to profiles
        try:
            cursor.execute("SELECT avatar_url FROM profiles LIMIT 1")
        except:
            print("Migrating database: Adding avatar_url to profiles...")
            cursor.execute("ALTER TABLE profiles ADD COLUMN avatar_url TEXT")

        # Migration: Add default_audio_lang and default_sub_lang to profiles
        try:
            cursor.execute("SELECT default_audio_lang FROM profiles LIMIT 1")
        except:
            print("Migrating database: Adding default_audio_lang and default_sub_lang to profiles...")
            cursor.execute("ALTER TABLE profiles ADD COLUMN default_audio_lang TEXT DEFAULT 'ara'")
            cursor.execute("ALTER TABLE profiles ADD COLUMN default_sub_lang TEXT DEFAULT 'ara'")

        # COMMIT profiles migration explicitly
        conn.commit()

        # ... (rest of function) ...

# ... (skip to update_media_metadata) ...

def update_media_metadata(media_id: int, metadata: dict):
    """Update metadata for a media item"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Handle Collection logic
        collection_data = metadata.pop('collection', None)
        c_tmdb_id = _upsert_collection(cursor, collection_data)
        if c_tmdb_id:
            metadata['collection_tmdb_id'] = c_tmdb_id

        # Valid columns whitelist
        VALID_COLUMNS = {
            'title', 'original_title', 'overview', 'release_date', 'year', 
            'vote_average', 'vote_count', 'popularity', 'poster_url', 
            'backdrop_url', 'genres', 'cast', 'crew', 'tmdb_id', 'imdb_id', 
            'type', 'size_bytes', 'duration', 'quality', 'locked', 'hidden',
            'season_number', 'episode_number', 'series_id', 'runtime', 'format',
            'certification', 'country', 'language', 'trailer_url', 'imdb_rating', 
            'tmdb_rating', 'total_episodes', 'total_seasons', 'episode_title',
            'collection_tmdb_id', 'file_path', 'folder_path',
            'status', 'logo_url',  # Series status (Ended/Returning) + TMDB logo
            'user_rating',
        }
        
        # Filter metadata to only include valid columns
        safe_metadata = {k: v for k, v in metadata.items() if k in VALID_COLUMNS}
        
        if not safe_metadata:
            print("No valid columns to update.")
            return

        set_clause = ', '.join([f'{k} = ?' for k in safe_metadata.keys()])
        # Also update updated_at
        if 'updated_at' not in safe_metadata:
            set_clause += ', updated_at = CURRENT_TIMESTAMP'
            
        params = list(safe_metadata.values()) + [media_id]
        
        cursor.execute(f'UPDATE media SET {set_clause} WHERE id = ?', params)
        conn.commit()
        
        # AUTO-EXTRACT CAST: If tmdb_id was updated, automatically fetch cast
        if 'tmdb_id' in safe_metadata and safe_metadata['tmdb_id']:
            try:
                from metadata import MetadataFetcher
                # Get media type
                cursor.execute("SELECT type, tmdb_id FROM media WHERE id = ?", (media_id,))
                media = cursor.fetchone()
                if media and media['tmdb_id']:
                    fetcher = MetadataFetcher()
                    fetcher.fetch_and_save_cast(
                        media_id=media_id,
                        tmdb_id=media['tmdb_id'],
                        media_type=media['type'],
                        limit=10
                    )
                    print(f"✓ Auto-extracted cast for media ID {media_id}")
            except Exception as e:
                print(f"Auto-cast extraction failed for media ID {media_id}: {e}")
        


@contextmanager
def get_connection():
    """Context manager for database connections"""
    conn = get_db()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def get_db():
    """Get a new database connection"""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")  # Wait up to 30s if DB is locked
    conn.execute("PRAGMA cache_size = -8000")   # 8MB cache for better read performance
    conn.row_factory = sqlite3.Row
    return conn

def execute_with_retry(func, max_retries=3, retry_delay=1.0):
    """Execute a database operation with retry logic for 'database is locked' errors"""
    import time
    for attempt in range(max_retries):
        try:
            return func()
        except Exception as e:
            if 'database is locked' in str(e) and attempt < max_retries - 1:
                print(f"[DB] Retry {attempt + 1}/{max_retries} after lock: {e}")
                time.sleep(retry_delay * (attempt + 1))
            else:
                raise

# =============================================================================
# Media Operations
# =============================================================================

def _upsert_collection(cursor, collection_data):
    """Upsert collection from metadata and return its TMDB ID"""
    if not collection_data or not collection_data.get('id'):
        return None
    
    c_tmdb_id = collection_data['id']
    cursor.execute("SELECT id FROM collections WHERE tmdb_id = ?", (c_tmdb_id,))
    if not cursor.fetchone():
        # Check if we have an existing 'auto' collection with the same name (Folder detection)
        # matches by name and where TMDB_ID is NULL (meaning it was created by folder scan)
        name = collection_data['name']
        cursor.execute("SELECT id FROM collections WHERE name = ? AND tmdb_id IS NULL", (name,))
        existing_auto = cursor.fetchone()
        
        poster = f"https://image.tmdb.org/t/p/w500{collection_data['poster_path']}" if collection_data.get('poster_path') else None
        backdrop = f"https://image.tmdb.org/t/p/original{collection_data['backdrop_path']}" if collection_data.get('backdrop_path') else None
        overview = collection_data.get('overview', '')
        
        if existing_auto:
            # Upgrade existing folder-collection to TMDB collection
            print(f"[Collections] Upgrading '{name}' to TMDB ID {c_tmdb_id}")
            cursor.execute("""
                UPDATE collections 
                SET tmdb_id = ?, poster_url = COALESCE(?, poster_url), backdrop_url = COALESCE(?, backdrop_url), overview = ?
                WHERE id = ?
            """, (c_tmdb_id, poster, backdrop, overview, existing_auto['id']))
        else:
            # Insert new
            cursor.execute("""
                INSERT INTO collections (name, tmdb_id, poster_url, backdrop_url, type, overview)
                VALUES (?, ?, ?, ?, 'auto', ?)
            """, (name, c_tmdb_id, poster, backdrop, overview))

    return c_tmdb_id

def get_media_by_tmdb_id(tmdb_id: int):
    """Get media by TMDb ID"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM media WHERE tmdb_id = ?", (tmdb_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def add_media(media_data: dict) -> int:
    """Add a new media entry to the database"""
    # Check if path is hidden
    file_path = media_data.get('file_path')
    if file_path and is_path_hidden(file_path):
        return None
        
    existing = None

    # Normalize path
    if file_path:
        file_path = os.path.normpath(file_path)
        media_data['file_path'] = file_path

    with get_connection() as conn:
        cursor = conn.cursor()
        
        # CRITICAL: Check if existing record is locked
        if file_path:
            # Use lower() for Windows case-insensitivity
            cursor.execute('SELECT id, locked FROM media WHERE lower(file_path) = ?', (file_path.lower(),))
            existing = cursor.fetchone()
            if existing and existing['locked']:
                print(f"[LOCKED] Skipping scan update for: {media_data.get('title')} (ID: {existing['id']})")
                return existing['id']
        
        # Handle Collection logic
        collection_data = media_data.pop('collection', None)
        c_tmdb_id = _upsert_collection(cursor, collection_data)
        if c_tmdb_id:
            media_data['collection_tmdb_id'] = c_tmdb_id

        # PREVENTION: Check for TMDB ID duplicates (same movie/series scanned from different path)
        tmdb_id = media_data.get('tmdb_id')
        media_type = media_data.get('type')
        if not existing and tmdb_id and media_type in ('movie', 'series'):
            cursor.execute('SELECT id, locked, quality, file_path, folder_path FROM media WHERE tmdb_id = ? AND type = ?', (tmdb_id, media_type))
            tmdb_existing = cursor.fetchone()
            if tmdb_existing:
                # If it's a series, ALWAYS merge (do not create a duplicate entry).
                # We update the folder path if missing, but we always return the existing ID so episodes are added to it.
                if media_type == 'series':
                    print(f"[TMDB SERIES MERGE] Merging '{media_data.get('title')}' into existing Series ID: {tmdb_existing['id']}")
                    existing = tmdb_existing # Triggers UPDATE later in the function
                else:
                    # For Movies: Check quality for upgrade
                    existing_has_path = bool(tmdb_existing['file_path'] or tmdb_existing['folder_path'])
                    
                    if not existing_has_path:
                        print(f"[PATH RESTORE] {media_data.get('title')} - Restoring missing file path")
                        existing = tmdb_existing  # Will trigger UPDATE instead of INSERT
                    else:
                        new_quality = media_data.get('quality', 'Unknown')
                        old_quality = tmdb_existing['quality'] or 'Unknown'
                        quality_order = {'4K': 5, '1080p': 4, '720p': 3, '576p': 2, '480p': 1, 'Unknown': 0}
                        
                        if quality_order.get(new_quality, 0) > quality_order.get(old_quality, 0):
                            print(f"[TMDB MOVIE UPGRADE] {media_data.get('title')} - Upgrading {old_quality} -> {new_quality}")
                            existing = tmdb_existing  # Will trigger UPDATE
                        else:
                            print(f"[TMDB DUPE SKIP] Skipping Movie {media_data.get('title')} ({new_quality}) - Already have {old_quality}")
                            return tmdb_existing['id']


        # Valid columns whitelist (same as update_media_metadata)
        VALID_COLUMNS = {
            'title', 'original_title', 'overview', 'release_date', 'year', 
            'vote_average', 'vote_count', 'popularity', 'poster_url', 
            'backdrop_url', 'genres', 'cast', 'crew', 'tmdb_id', 'imdb_id', 
            'type', 'size_bytes', 'duration', 'quality', 'locked', 'hidden',
            'season_number', 'episode_number', 'series_id', 'runtime', 'format',
            'certification', 'country', 'language', 'trailer_url', 'imdb_rating', 
            'tmdb_rating', 'total_episodes', 'total_seasons', 'episode_title',
            'collection_tmdb_id', 'file_path', 'folder_path',
            'status', 'logo_url',  # Series status (Ended/Returning) + TMDB logo
            'user_rating',
        }
        
        # Filter metadata
        safe_media = {k: v for k, v in media_data.items() if k in VALID_COLUMNS and k != 'collection_name'}
        
        if not safe_media:
             return None

        if existing:
            # Update existing record
            media_id = existing['id']
            # We must use UPDATE logic, similar to update_media_metadata but with the filtered columns here
            set_clause = ', '.join([f'{k} = ?' for k in safe_media.keys()])
            if 'updated_at' not in safe_media:
                set_clause += ', updated_at = CURRENT_TIMESTAMP'
            
            params = list(safe_media.values()) + [media_id]
            cursor.execute(f'UPDATE media SET {set_clause} WHERE id = ?', params)
        else:
            # Insert new record
            columns = ', '.join(safe_media.keys())
            placeholders = ', '.join(['?' for _ in safe_media])
            
            cursor.execute(
                f'INSERT INTO media ({columns}) VALUES ({placeholders})',
                list(safe_media.values())
            )
            media_id = cursor.lastrowid
        
        # Auto-link Collection
        collection_name = media_data.get('collection_name')
        if collection_name:
            # Create collection if not exists
            cursor.execute("INSERT OR IGNORE INTO collections (name, type) VALUES (?, 'auto')", (collection_name,))
            
            # Get Collection ID
            cursor.execute("SELECT id FROM collections WHERE name = ?", (collection_name,))
            col_row = cursor.fetchone()
            if col_row:
                col_id = col_row['id']
                # Link item
                cursor.execute("INSERT OR IGNORE INTO collection_items (collection_id, media_id) VALUES (?, ?)", (col_id, media_id))

        conn.commit()
        
        # AUTO-EXTRACT CAST: Automatically fetch cast for new items
        if 'tmdb_id' in safe_media and safe_media['tmdb_id']:
            try:
                from metadata import MetadataFetcher
                # Use thread/async approach ideally, but for now synchronous is safer to ensure data
                # We can suppress errors so it doesn't block the scan
                fetcher = MetadataFetcher()
                fetcher.fetch_and_save_cast(
                    media_id=media_id,
                    tmdb_id=safe_media['tmdb_id'],
                    media_type=safe_media.get('type', 'movie'),
                    limit=10
                )
                print(f"✓ Auto-extracted cast for new media: {safe_media.get('title')}")
            except Exception as e:
                print(f"Auto-cast extraction failed for new media {media_id}: {e}")

        return media_id

def get_media_by_id(media_id: int) -> dict:
    """Get a single media item by ID"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM media WHERE id = ?', (media_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_media_by_path(file_path: str) -> dict:
    """Get media item by exact file_path match (case-insensitive)."""
    norm_path = os.path.normpath(file_path)
    with get_connection() as conn:
        cursor = conn.cursor()
        # Check ONLY exact file_path match
        cursor.execute('SELECT * FROM media WHERE lower(file_path) = ?', (norm_path.lower(),))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_media_by_folder_path(folder_path: str) -> dict:
    """Get media item by folder_path match (for series). Case-insensitive."""
    norm_path = os.path.normpath(folder_path)
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM media WHERE lower(folder_path) = ?', (norm_path.lower(),))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_media_by_tmdb_id(tmdb_id: int) -> dict:
    """Get media item by TMDb ID"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM media WHERE tmdb_id = ?', (tmdb_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_all_media(filters: dict = None, sort_by: str = 'title', limit: int = 100, offset: int = 0) -> list:
    """Get all media with optional filters and sorting"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        query = 'SELECT * FROM media WHERE type != "episode"'
        params = []
        
        if filters:
            if filters.get('type'):
                query += ' AND type = ?'
                params.append(filters['type'])
            if filters.get('genre'):
                query += ' AND genres LIKE ?'
                params.append(f'%{filters["genre"]}%')
            if filters.get('year'):
                query += ' AND year = ?'
                params.append(int(filters['year']))
            if filters.get('year_from'):
                query += ' AND year >= ?'
                params.append(filters['year_from'])
            if filters.get('year_to'):
                query += ' AND year <= ?'
                params.append(filters['year_to'])
            if filters.get('certification'):
                query += ' AND certification = ?'
                params.append(filters['certification'])
            if filters.get('search'):
                search_val = filters['search'].strip()
                
                # Check if search is a numeric ID
                if search_val.isdigit():
                    query += ' AND (id = ? OR tmdb_id = ?)'
                    params.extend([int(search_val), int(search_val)])
                else:
                    # SMART SEARCH LOGIC
                    # 1. Normalize query
                    # 2. Split into terms
                    # 3. Search across Title, Original Title, and Overview
                    # 4. Handle Arabic variations (simple)
                    
                    terms = search_val.split()
                    if terms:
                        # Create a group for the search condition
                        query += ' AND ('
                        
                        term_conditions = []
                        for term in terms:
                            # Sanitize partial term
                            term = term.replace('%', '').replace('_', '')
                            
                            # Build term condition: (Title LIKE %term% OR Orig LIKE %term%)
                            # We use AND between terms to ensure ALL terms are present (Refining search)
                             
                            sub_cond = '(title LIKE ? OR original_title LIKE ? OR overview LIKE ? OR genres LIKE ?)'
                            term_conditions.append(sub_cond)
                            params.extend([f'%{term}%', f'%{term}%', f'%{term}%', f'%{term}%'])
                            
                        # Join all term conditions with AND (Intersection)
                        query += ' AND '.join(term_conditions)
                        query += ')'
        
        # Sorting
        sort_options = {
            'added_at': 'created_at DESC',
            'year': 'year DESC',
            'title': 'title ASC',
            'tmdb_rating': 'tmdb_rating DESC',
            'random': 'RANDOM()',
            'quality_desc': """CASE 
                WHEN quality LIKE '%4K%' THEN 5 
                WHEN quality LIKE '%2160p%' THEN 5
                WHEN quality LIKE '%1080p%' THEN 4 
                WHEN quality LIKE '%720p%' THEN 3 
                WHEN quality LIKE '%576p%' THEN 2 
                WHEN quality LIKE '%480p%' THEN 1 
                ELSE 0 END DESC""",
            'quality_asc': """CASE 
                WHEN quality LIKE '%4K%' THEN 5 
                WHEN quality LIKE '%2160p%' THEN 5
                WHEN quality LIKE '%1080p%' THEN 4 
                WHEN quality LIKE '%720p%' THEN 3 
                WHEN quality LIKE '%576p%' THEN 2 
                WHEN quality LIKE '%480p%' THEN 1 
                ELSE 0 END ASC"""
        }
        
        order_by = sort_options.get(sort_by, sort_options['title'])
        query += f' ORDER BY {order_by}'
        
        if limit:
            query += ' LIMIT ? OFFSET ?'
            params.extend([limit, offset])
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

def get_media_count(filters: dict = None) -> int:
    """Get total count of media matching filters"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        query = 'SELECT COUNT(*) FROM media WHERE type != "episode"'
        params = []
        
        if filters:
            if filters.get('type'):
                query += ' AND type = ?'
                params.append(filters['type'])
            if filters.get('genre'):
                query += ' AND genres LIKE ?'
                params.append(f'%{filters["genre"]}%')
            if filters.get('year'):
                query += ' AND year = ?'
                params.append(int(filters['year']))
            if filters.get('year_from'):
                query += ' AND year >= ?'
                params.append(filters['year_from'])
            if filters.get('year_to'):
                query += ' AND year <= ?'
                params.append(filters['year_to'])
            if filters.get('certification'):
                query += ' AND certification = ?'
                params.append(filters['certification'])
            if filters.get('search'):
                search_val = filters['search'].strip()
                if str(search_val).isdigit():
                    query += ' AND (id = ? OR tmdb_id = ?)'
                    params.extend([int(search_val), int(search_val)])
                else:
                    query += ' AND (title LIKE ? OR original_title LIKE ?)'
                    search_term = f'%{search_val}%'
                    params.extend([search_term, search_term])
        
        cursor.execute(query, params)
        return cursor.fetchone()[0]

def delete_media(media_id: int):
    """Delete media item by ID with explicit cleanup"""
    try:
        with get_connection() as conn:
            cursor = conn.cursor()
            
            # 1. DELETE DEPENDENTS EXPLICITLY (Safe for FK off/on)
            cursor.execute('DELETE FROM watch_history WHERE media_id = ?', (media_id,))
            cursor.execute('DELETE FROM favorites WHERE media_id = ?', (media_id,))
            cursor.execute('DELETE FROM collection_items WHERE media_id = ?', (media_id,))
            cursor.execute('DELETE FROM playlist_items WHERE media_id = ?', (media_id,))
            cursor.execute('DELETE FROM media_cast WHERE media_id = ?', (media_id,))
            
            # 2. Delete Media
            cursor.execute('DELETE FROM media WHERE id = ?', (media_id,))
            # Delete episodes if it's a series
            cursor.execute('DELETE FROM media WHERE series_id = ?', (media_id,))
            
            conn.commit()
            
            # 3. Cleanup orphans
            try:
                cursor.execute("""
                    DELETE FROM cast_members
                    WHERE id NOT IN (SELECT DISTINCT person_id FROM media_cast)
                """)
                if cursor.rowcount > 0:
                    print(f"✓ Cleaned {cursor.rowcount} orphaned actors")
                conn.commit()
            except Exception as e:
                print(f"Cast cleanup warning: {e}")
            
            # 4. Delete thumbnails from disk
            try:
                from timeline_thumbs import get_timeline_thumbnails
                get_timeline_thumbnails().delete_thumbnails(media_id)
                print(f"✓ Cleaned thumbnails for media {media_id}")
            except Exception as e:
                print(f"Thumbnail cleanup warning: {e}")
                
    except Exception as e:
        print(f"CRITICAL ERROR deleting media {media_id}: {e}")
        # Log to file for debugging
        try:
            with open("backend_delete_error.log", "w") as f:
                f.write(f"Error deleting {media_id}: {str(e)}\n")
        except: pass
        raise e

# =============================================================================
# Hidden Path Operations
# =============================================================================

def hide_path(path: str):
    """Add path to hidden list"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT OR REPLACE INTO hidden_paths (path) VALUES (?)', (path,))
        conn.commit()

def is_path_hidden(path: str) -> bool:
    """Check if path is hidden"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT 1 FROM hidden_paths WHERE path = ?', (path,))
        return cursor.fetchone() is not None

def unhide_path(path: str):
    """Remove path from hidden list"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM hidden_paths WHERE path = ?', (path,))
        conn.commit()

def get_series_episodes(series_id: int, profile_id: int = 1) -> list:
    """Get all episodes for a series, ordered by season and episode, including watch progress"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT m.*, h.position, h.progress_percent, h.last_watched, h.completed
            FROM media m
            LEFT JOIN watch_history h ON m.id = h.media_id AND h.profile_id = ?
            WHERE m.series_id = ? 
            ORDER BY m.season_number, m.episode_number
        ''', (profile_id, series_id))
        return [dict(row) for row in cursor.fetchall()]



# =============================================================================
# Watch History Operations
# =============================================================================

def update_watch_progress(media_id: int, position: float, duration: float, profile_id: int = 1):
    """Update watch progress for a media item. Protects against accidental 0 resets."""
    import time as _time
    progress = (position / duration * 100) if duration > 0 else 0
    completed = progress > 90
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            with get_connection() as conn:
                cursor = conn.cursor()
                
                # Guard against accidental resets: if new position is exactly 0 but we already have progress,
                # ignore the update. (This happens when video players initialize or refresh).
                if position < 1.0:
                    cursor.execute('SELECT position FROM watch_history WHERE media_id = ? AND profile_id = ?', (media_id, profile_id))
                    row = cursor.fetchone()
                    if row and row['position'] > 5.0:
                        print(f"[WatchHistory] Ignoring accidental reset for media {media_id} (profile {profile_id}) from {row['position']} to {position}")
                        return

                cursor.execute('''
                    INSERT INTO watch_history (media_id, profile_id, position, duration, progress_percent, completed, last_watched)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(media_id, profile_id) DO UPDATE SET
                        position = excluded.position,
                        duration = excluded.duration,
                        progress_percent = excluded.progress_percent,
                        completed = excluded.completed,
                        last_watched = CURRENT_TIMESTAMP,
                        watch_count = watch_count + CASE WHEN excluded.completed = 1 AND watch_history.completed = 0 THEN 1 ELSE 0 END
                ''', (media_id, profile_id, position, duration, progress, completed))
                conn.commit()
                return  # Success
        except Exception as e:
            if 'locked' in str(e).lower() and attempt < max_retries - 1:
                _time.sleep(0.1 * (attempt + 1))  # Backoff: 100ms, 200ms, 300ms
                continue
            raise

def get_continue_watching(limit: int = 10, profile_id: int = 1) -> list:
    """Get the LAST in-progress episode per series (or movie). One entry per show."""
    with get_connection() as conn:
        cursor = conn.cursor()
        # CTE: for each series (or standalone movie), find the most recently watched
        # in-progress item. COALESCE(series_id, id) is the group key.
        cursor.execute('''
            WITH latest_per_group AS (
                SELECT
                    COALESCE(m.series_id, m.id) AS group_id,
                    MAX(h.last_watched)          AS max_last_watched
                FROM media m
                JOIN watch_history h ON m.id = h.media_id AND h.profile_id = ?
                GROUP BY COALESCE(m.series_id, m.id)
            )
            SELECT
                m.*,
                h.position,
                h.progress_percent,
                h.last_watched,
                s.title      AS series_title,
                s.poster_url AS series_poster,
                COALESCE(s.poster_url, m.poster_url) AS effective_poster
            FROM media m
            JOIN watch_history h ON m.id = h.media_id AND h.profile_id = ?
            LEFT JOIN media s ON m.series_id = s.id
            JOIN latest_per_group lpg
                ON COALESCE(m.series_id, m.id) = lpg.group_id
               AND h.last_watched = lpg.max_last_watched
            ORDER BY h.last_watched DESC
            LIMIT ?
        ''', (profile_id, profile_id, limit))

        results = []
        for row in cursor.fetchall():
            item = dict(row)
            if item.get('type') == 'episode' and item.get('series_title'):
                if not item.get('poster_url'):
                    item['poster_url'] = item['series_poster']
                item['display_title'] = (
                    f"{item['series_title']} "
                    f"- S{item['season_number']:02d}E{item['episode_number']:02d}"
                )
            results.append(item)

        return results

def get_recently_watched(limit: int = 10, profile_id: int = 1) -> list:
    """Get recently watched: show all individual episodes/movies in history order."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT 
                m.*, 
                h.position, 
                h.progress_percent, 
                h.last_watched, 
                h.completed,
                s.title      AS series_title,
                s.poster_url AS series_poster,
                COALESCE(s.poster_url, m.poster_url) AS effective_poster
            FROM media m
            JOIN watch_history h ON m.id = h.media_id AND h.profile_id = ?
            LEFT JOIN media s ON m.series_id = s.id
            ORDER BY h.last_watched DESC
            LIMIT ?
        ''', (profile_id, limit))

        results = []
        for row in cursor.fetchall():
            item = dict(row)
            if item.get('type') == 'episode' and item.get('series_title'):
                if not item.get('poster_url'):
                    item['poster_url'] = item['series_poster']
                item['display_title'] = (
                    f"{item['series_title']} "
                    f"- S{item['season_number']:02d}E{item['episode_number']:02d}"
                )
            results.append(item)

        return results

def get_watch_position(media_id: int, profile_id: int = 1) -> float:
    """Get the last watch position for a media item"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT position FROM watch_history WHERE media_id = ? AND profile_id = ?', (media_id, profile_id))
        row = cursor.fetchone()
        return row['position'] if row else 0

# =============================================================================
# Library Path Operations
# =============================================================================

def add_library_path(path: str) -> int:
    """Add a new library path"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT OR IGNORE INTO library_paths (path) VALUES (?)', (path,))
        conn.commit()
        return cursor.lastrowid

def get_library_paths(only_enabled: bool = False) -> list:
    """Get all library paths"""
    with get_connection() as conn:
        cursor = conn.cursor()
        if only_enabled:
            cursor.execute('SELECT * FROM library_paths WHERE enabled = 1')
        else:
            cursor.execute('SELECT * FROM library_paths')
        return [dict(row) for row in cursor.fetchall()]

def toggle_library_path_lock(path_id: int) -> bool:
    """Toggle the enabled/locked status of a library path"""
    with get_connection() as conn:
        cursor = conn.cursor()
        # Get current status
        cursor.execute('SELECT enabled FROM library_paths WHERE id = ?', (path_id,))
        row = cursor.fetchone()
        if not row:
            return False
        
        new_status = 0 if row['enabled'] else 1
        cursor.execute('UPDATE library_paths SET enabled = ? WHERE id = ?', (new_status, path_id))
        conn.commit()
        return bool(new_status)

def remove_library_path(path_id: int):
    """Remove a library path"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM library_paths WHERE id = ?', (path_id,))
        conn.commit()

def update_scan_time(path: str):
    """Update the last scanned time for a path"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE library_paths SET last_scanned = CURRENT_TIMESTAMP WHERE path = ?', (path,))
        conn.commit()

# =============================================================================
# Settings Operations
# =============================================================================

def get_setting(key: str, default=None):
    """Get a setting value"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT value FROM settings WHERE key = ?', (key,))
        row = cursor.fetchone()
        return row['value'] if row else default

def set_setting(key: str, value: str):
    """Set a setting value"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', (key, value))
        conn.commit()

# =============================================================================
# Statistics — تم تحسين الاستعلام: استعلام واحد بدلاً من 4
# =============================================================================

def get_library_stats() -> dict:
    """Get library statistics using a single optimized query"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Combined query: COUNT by type + SUM size in one pass
        cursor.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN type = 'movie'   THEN 1 ELSE 0 END), 0) as movies,
                COALESCE(SUM(CASE WHEN type = 'series'  THEN 1 ELSE 0 END), 0) as series,
                COALESCE(SUM(CASE WHEN type = 'episode' THEN 1 ELSE 0 END), 0) as episodes,
                COALESCE(SUM(size_bytes), 0) as total_size
            FROM media
        """)
        row = cursor.fetchone()
        
        return {
            'movies': row['movies'],
            'series': row['series'],
            'episodes': row['episodes'],
            'total_size_gb': round(row['total_size'] / (1024**3), 2)
        }



def remove_from_watch_history(media_id, profile_id: int = 1):
    """Remove media from watch history for a specific profile"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM watch_history WHERE media_id = ? AND profile_id = ?", (media_id, profile_id))
        conn.commit()
    return True

# init_db()  <-- MOVED to explicit call in app.py or scripts
