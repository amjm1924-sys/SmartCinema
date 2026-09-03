# Analytics Module for SmartCinema
# Track watch events and provide statistics

import os
import sqlite3
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from database import get_connection

# Initialize analytics tables
def init_analytics_tables():
    """Create analytics tables if they don't exist"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Watch events table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS watch_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                media_id INTEGER NOT NULL,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP,
                duration_watched INTEGER DEFAULT 0,
                bytes_streamed INTEGER DEFAULT 0,
                FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
            )
        """)
        
        # Create index for faster queries
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_watch_events_started 
            ON watch_events(started_at)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_watch_events_media 
            ON watch_events(media_id)
        """)
        
        conn.commit()


def record_watch_start(media_id: int) -> int:
    """Record when a user starts watching a media"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO watch_events (media_id, started_at)
            VALUES (?, CURRENT_TIMESTAMP)
        """, (media_id,))
        conn.commit()
        return cursor.lastrowid


def record_watch_end(event_id: int, duration_watched: int, bytes_streamed: int = 0):
    """Record when a user finishes watching"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE watch_events 
            SET ended_at = CURRENT_TIMESTAMP, 
                duration_watched = ?,
                bytes_streamed = ?
            WHERE id = ?
        """, (duration_watched, bytes_streamed, event_id))
        conn.commit()


def get_genre_stats(days: int = 30) -> list:
    """Get watch counts by genre for the last N days"""
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT m.genres, COUNT(we.id) as watch_count, SUM(we.duration_watched) as total_duration
            FROM watch_events we
            JOIN media m ON we.media_id = m.id
            WHERE we.started_at >= ?
            GROUP BY m.genres
            ORDER BY watch_count DESC
        """, (cutoff,))
        
        # Parse genres and aggregate
        genre_counts = {}
        genre_duration = {}
        
        for row in cursor.fetchall():
            genres = row['genres'] or 'Unknown'
            count = row['watch_count']
            duration = row['total_duration'] or 0
            
            for genre in genres.split(','):
                genre = genre.strip()
                if genre:
                    genre_counts[genre] = genre_counts.get(genre, 0) + count
                    genre_duration[genre] = genre_duration.get(genre, 0) + duration
        
        # Sort by count
        result = []
        for genre, count in sorted(genre_counts.items(), key=lambda x: -x[1]):
            result.append({
                'genre': genre,
                'watch_count': count,
                'total_duration': genre_duration.get(genre, 0),
                'total_hours': round(genre_duration.get(genre, 0) / 3600, 2)
            })
        
        return result[:15]  # Top 15 genres


def get_watch_time_stats(days: int = 30, group_by: str = 'day') -> list:
    """Get total watch time grouped by day/week/month"""
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    
    if group_by == 'week':
        date_format = "%Y-W%W"
    elif group_by == 'month':
        date_format = "%Y-%m"
    else:
        date_format = "%Y-%m-%d"
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                strftime(?, started_at) as period,
                COUNT(*) as watch_count,
                SUM(duration_watched) as total_duration
            FROM watch_events
            WHERE started_at >= ?
            GROUP BY period
            ORDER BY period
        """, (date_format, cutoff))
        
        return [{
            'period': row['period'],
            'watch_count': row['watch_count'],
            'total_duration': row['total_duration'] or 0,
            'total_hours': round((row['total_duration'] or 0) / 3600, 2)
        } for row in cursor.fetchall()]


def get_bandwidth_stats(days: int = 30) -> list:
    """Get bandwidth usage over time"""
    cutoff = (datetime.now() - timedelta(days=days)).isoformat()
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                strftime('%Y-%m-%d', started_at) as date,
                SUM(bytes_streamed) as total_bytes
            FROM watch_events
            WHERE started_at >= ? AND bytes_streamed > 0
            GROUP BY date
            ORDER BY date
        """, (cutoff,))
        
        return [{
            'date': row['date'],
            'bytes': row['total_bytes'] or 0,
            'gb': round((row['total_bytes'] or 0) / (1024**3), 2)
        } for row in cursor.fetchall()]


def get_overview_stats() -> dict:
    """Get overall analytics summary"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Total watch events
        cursor.execute("SELECT COUNT(*) as count FROM watch_events")
        total_events = cursor.fetchone()['count']
        
        # Total watch time
        cursor.execute("SELECT SUM(duration_watched) as total FROM watch_events")
        total_duration = cursor.fetchone()['total'] or 0
        
        # Total bandwidth
        cursor.execute("SELECT SUM(bytes_streamed) as total FROM watch_events")
        total_bytes = cursor.fetchone()['total'] or 0
        
        # Most watched media
        cursor.execute("""
            SELECT m.id, m.title, m.poster_url, COUNT(we.id) as watch_count
            FROM watch_events we
            JOIN media m ON we.media_id = m.id
            GROUP BY m.id
            ORDER BY watch_count DESC
            LIMIT 10
        """)
        top_media = [dict(row) for row in cursor.fetchall()]
        
        # This week stats
        week_ago = (datetime.now() - timedelta(days=7)).isoformat()
        cursor.execute("""
            SELECT COUNT(*) as count, SUM(duration_watched) as duration
            FROM watch_events WHERE started_at >= ?
        """, (week_ago,))
        week_row = cursor.fetchone()
        
        return {
            'total_events': total_events,
            'total_watch_hours': round(total_duration / 3600, 2),
            'total_bandwidth_gb': round(total_bytes / (1024**3), 2),
            'top_media': top_media,
            'this_week': {
                'events': week_row['count'] or 0,
                'hours': round((week_row['duration'] or 0) / 3600, 2)
            }
        }


def get_personal_stats(profile_id: int) -> dict:
    """Get personal stats for a specific profile"""
    with get_connection() as conn:
        cursor = conn.cursor()
        
        # Total watch duration (using position as an approximation of watched time)
        cursor.execute("""
            SELECT SUM(position) as total_seconds
            FROM watch_history
            WHERE profile_id = ?
        """, (profile_id,))
        total_seconds = cursor.fetchone()['total_seconds'] or 0
        total_hours = round(total_seconds / 3600, 2)
        
        # Completed movies
        cursor.execute("""
            SELECT COUNT(*) as count FROM watch_history wh
            JOIN media m ON wh.media_id = m.id
            WHERE wh.profile_id = ? AND wh.completed = 1 AND m.type = 'movie'
        """, (profile_id,))
        movies_watched = cursor.fetchone()['count'] or 0
        
        # Episodes watched (completed or partially watched)
        # Assuming if it's in watch_history, it's watched. The prompt says 'total series episodes watched' so we can just count where completed=1 or just count all. Let's count all episodes.
        cursor.execute("""
            SELECT COUNT(*) as count FROM watch_history wh
            JOIN media m ON wh.media_id = m.id
            WHERE wh.profile_id = ? AND m.type = 'episode'
        """, (profile_id,))
        episodes_watched = cursor.fetchone()['count'] or 0
        
        # Top genres
        cursor.execute("""
            SELECT m.genres FROM watch_history wh
            JOIN media m ON wh.media_id = m.id
            WHERE wh.profile_id = ? AND m.genres IS NOT NULL AND m.genres != ''
        """, (profile_id,))
        
        genre_counts = {}
        for row in cursor.fetchall():
            for genre in row['genres'].split(','):
                genre = genre.strip()
                if genre:
                    genre_counts[genre] = genre_counts.get(genre, 0) + 1
                    
        top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        top_genres_formatted = [{'genre': g[0], 'count': g[1]} for g in top_genres]
        
        # Favorite day
        cursor.execute("""
            SELECT strftime('%w', last_watched) as day_of_week, COUNT(*) as cnt
            FROM watch_history
            WHERE profile_id = ?
            GROUP BY day_of_week
            ORDER BY cnt DESC
            LIMIT 1
        """, (profile_id,))
        
        day_row = cursor.fetchone()
        days_map = {'0': 'الأحد', '1': 'الإثنين', '2': 'الثلاثاء', '3': 'الأربعاء', '4': 'الخميس', '5': 'الجمعة', '6': 'السبت'}
        favorite_day = days_map.get(day_row['day_of_week'], 'غير محدد') if day_row else 'غير محدد'
        
        return {
            'total_hours': total_hours,
            'movies_watched': movies_watched,
            'episodes_watched': episodes_watched,
            'top_genres': top_genres_formatted,
            'favorite_day': favorite_day
        }


# Flask Blueprint
analytics_bp = Blueprint('analytics', __name__, url_prefix='/api/analytics')


@analytics_bp.route('/init', methods=['POST'])
def api_init_tables():
    """Initialize analytics tables"""
    init_analytics_tables()
    return jsonify({'success': True})


@analytics_bp.route('/record/start', methods=['POST'])
def api_record_start():
    """Record watch start event"""
    data = request.json
    media_id = data.get('media_id')
    
    if not media_id:
        return jsonify({'error': 'media_id required'}), 400
    
    event_id = record_watch_start(media_id)
    return jsonify({'event_id': event_id})


@analytics_bp.route('/record/end', methods=['POST'])
def api_record_end():
    """Record watch end event"""
    data = request.json
    event_id = data.get('event_id')
    duration = data.get('duration_watched', 0)
    bytes_streamed = data.get('bytes_streamed', 0)
    
    if not event_id:
        return jsonify({'error': 'event_id required'}), 400
    
    record_watch_end(event_id, duration, bytes_streamed)
    return jsonify({'success': True})


@analytics_bp.route('/genres')
def api_genre_stats():
    """Get genre watch statistics"""
    days = request.args.get('days', 30, type=int)
    stats = get_genre_stats(days)
    return jsonify({'genres': stats, 'days': days})


@analytics_bp.route('/watchtime')
def api_watchtime_stats():
    """Get watch time statistics"""
    days = request.args.get('days', 30, type=int)
    group_by = request.args.get('group_by', 'day')
    stats = get_watch_time_stats(days, group_by)
    return jsonify({'watchtime': stats, 'days': days, 'group_by': group_by})


@analytics_bp.route('/bandwidth')
def api_bandwidth_stats():
    """Get bandwidth usage statistics"""
    days = request.args.get('days', 30, type=int)
    stats = get_bandwidth_stats(days)
    return jsonify({'bandwidth': stats, 'days': days})


@analytics_bp.route('/overview')
def api_overview():
    """Get analytics overview"""
    stats = get_overview_stats()
    return jsonify(stats)


@analytics_bp.route('/personal')
def api_personal_stats():
    """Get personal stats for a specific profile"""
    profile_id = request.args.get('profile_id')
    if not profile_id:
        profile_id = request.headers.get('X-Profile-ID')
    if not profile_id:
        profile_id = 1 # Default to 1
    
    stats = get_personal_stats(int(profile_id))
    return jsonify(stats)


@analytics_bp.route('/decades')
def api_decades_stats():
    """Get movies/series distribution by decade"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                ((year / 10) * 10) as decade,
                COUNT(*) as count,
                type
            FROM media
            WHERE year IS NOT NULL AND year > 1900
            GROUP BY decade, type
            ORDER BY decade DESC
        """)
        
        # Aggregate by decade
        decades = {}
        for row in cursor.fetchall():
            decade = f"{row['decade']}s"
            if decade not in decades:
                decades[decade] = {'decade': decade, 'movies': 0, 'series': 0, 'total': 0}
            
            if row['type'] == 'movie':
                decades[decade]['movies'] += row['count']
            elif row['type'] == 'series':
                decades[decade]['series'] += row['count']
            decades[decade]['total'] += row['count']
        
        return jsonify(list(decades.values()))


@analytics_bp.route('/quality')
def api_quality_stats():
    """Get library quality distribution (4K, 1080p, 720p, SD)"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN quality LIKE '%4K%' OR quality LIKE '%2160%' THEN '4K'
                    WHEN quality LIKE '%1080%' THEN '1080p'
                    WHEN quality LIKE '%720%' THEN '720p'
                    WHEN quality LIKE '%480%' THEN '480p'
                    WHEN quality IS NULL OR quality = '' THEN 'Unknown'
                    ELSE 'SD'
                END as quality_group,
                COUNT(*) as count
            FROM media
            WHERE type IN ('movie', 'series')
            GROUP BY quality_group
            ORDER BY 
                CASE quality_group
                    WHEN '4K' THEN 1
                    WHEN '1080p' THEN 2
                    WHEN '720p' THEN 3
                    WHEN '480p' THEN 4
                    WHEN 'SD' THEN 5
                    ELSE 6
                END
        """)
        
        results = []
        total = 0
        for row in cursor.fetchall():
            results.append({
                'quality': row['quality_group'],
                'count': row['count']
            })
            total += row['count']
        
        # Add percentages
        for item in results:
            item['percentage'] = round((item['count'] / total * 100), 1) if total > 0 else 0
        
        return jsonify(results)


@analytics_bp.route('/countries')
def api_country_stats():
    """Get production country distribution"""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT country, COUNT(*) as count
            FROM media
            WHERE country IS NOT NULL AND country != ''
            GROUP BY country
            ORDER BY count DESC
            LIMIT 15
        """)
        
        return jsonify([dict(row) for row in cursor.fetchall()])


@analytics_bp.route('/actors')
def api_top_actors():
    """Get top actors by appearance count in library"""
    limit = request.args.get('limit', 10, type=int)
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT cm.id, cm.name, cm.profile_path, 
                   COUNT(DISTINCT we.media_id) as watched_media_count,
                   SUM(we.duration_watched) as total_watch_time
            FROM cast_members cm
            JOIN media_cast mc ON cm.id = mc.person_id
            JOIN watch_events we ON mc.media_id = we.media_id
            GROUP BY cm.id
            ORDER BY total_watch_time DESC
            LIMIT ?
        """, (limit,))
        
        results = []
        for row in cursor.fetchall():
            actor = dict(row)
            if actor.get('profile_path'):
                actor['profile_url'] = f"https://image.tmdb.org/t/p/w185{actor['profile_path']}"
            results.append(actor)
        
        return jsonify(results)

