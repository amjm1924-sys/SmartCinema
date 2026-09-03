// Media Types matching CinemaStream backend schema

export interface Media {
  id: number;
  title: string;
  type: 'movie' | 'series' | 'episode';
  file_path?: string;
  folder_path?: string;
  poster_url?: string;
  backdrop_url?: string;
  overview?: string;
  tmdb_id?: number;
  imdb_id?: string;
  tmdb_rating?: number;
  imdb_rating?: number;
  year?: number;
  genres?: string; // comma-separated string
  quality?: string;
  format?: string;
  size_bytes?: number;
  duration?: number; // in seconds
  duration_formatted?: string; // e.g. "1h 30m"
  added_at?: string;
  country?: string;
  runtime?: number; // in minutes
  collection_name?: string;
  trailer_url?: string;
  trailer_local?: string;
  certification?: string;

  // For series
  total_seasons?: number;
  total_episodes?: number;

  // External / AI recommendation fields
  in_library?: boolean;
  library_id?: number;

  // For episodes
  series_id?: number;
  season_number?: number;
  episode_number?: number;
  episode_title?: string;

  // Watch progress
  watch_position?: number; // current playback position in seconds
  progress_percent?: number; // percentage 0-100

  // Intro
  intro_start?: number;
  intro_end?: number;

  // Additional Metadata
   
  tmdb_seasons?: any[];
  tmdb_status?: string;
  collection_tmdb_id?: number;

  // Personal Rating
  user_rating?: number | null;
}

export interface WatchProgress {
  media_id: number;
  progress: number; // percentage 0-100
  position: number; // seconds
  duration: number; // seconds
  last_watched: string;
}

export interface LibraryPath {
  id: number;
  path: string;
  added_at: string;
  last_scan?: string;
}

export interface ScanStatus {
  is_scanning: boolean;
  current_path: string;
  progress: number;
  total: number;
  current_file: string;
  stats?: {
    movies_total: number;
    movies_processed: number;
    series_total: number;
    series_processed: number;
    failed: number;
  };
}

export interface LibraryStats {
  total_movies: number;
  total_series: number;
  total_episodes: number;
  total_size_gb: number;
}

export interface Subtitle {
  path: string;
  label: string;
  lang: string;
}

export interface Collection {
  id: number;
  name: string;
  poster_url?: string;
  backdrop_url?: string;
  overview?: string;
  media_count?: number;
}
