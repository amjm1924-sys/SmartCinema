"""
Intro Detection Module for SmartCinema.

Detects recurring audio segments (intros/outros) across TV show episodes
by comparing energy profiles using windowed cosine similarity.

Algorithm:
1. Extract first 7 minutes of audio from 2-3 episodes (low-quality mono WAV)
2. Compute RMS energy profile at 0.5s resolution for each episode
3. Build a 2D cosine similarity matrix between windowed segments
4. Find the longest diagonal line above threshold (= matching audio segment)
5. Return per-episode timestamps
"""

import os
import subprocess
import random
import logging
import tempfile
import wave
from database import get_connection

logger = logging.getLogger(__name__)


class IntroDetector:
    """
    Detects TV show intro segments by comparing audio fingerprints
    between episodes of the same season.
    """

    def __init__(self):
        self.temp_dir = tempfile.gettempdir()
        self.sr = 4000          # Sample rate for audio analysis (Hz)
        self.chunk_s = 0.5      # Energy profile resolution (seconds per chunk)
        self.scan_minutes = 15  # Analyze first 15 minutes of each episode
        self.min_intro_s = 15   # Minimum intro duration to detect (seconds)
        self.max_intro_s = 180  # Maximum intro duration (seconds)
        self.sim_threshold = 0.5  # Cosine similarity threshold for matching
        self.window_s = 8       # Sliding window size for comparison (seconds)

    def check_ffmpeg(self):
        """Check if ffmpeg is available on the system."""
        try:
            subprocess.run(
                ['ffmpeg', '-version'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True
            )
            return True
        except Exception:
            return False

    def detect_intro_for_season(self, series_id, season_number):
        """
        Detect intro timestamps for episodes in a season.

        Returns:
            dict: {episode_id: (start_seconds, end_seconds)} for detected episodes
            None: if detection fails
        """
        if not self.check_ffmpeg():
            logger.error("FFmpeg not found - cannot detect intro")
            return None

        # Get all episodes for this season
        episodes = self._get_episodes(series_id, season_number)
        if len(episodes) < 2:
            logger.warning(f"Season has {len(episodes)} episode(s) - need at least 2")
            return None

        # 1. Discover the intro by comparing 2 random episodes
        n_samples = min(len(episodes), 3)
        samples = random.sample(episodes, n_samples)
        logger.info(f"Sampled {n_samples} episodes for discovery: {[s['id'] for s in samples]}")

        # Extract audio for samples
        sample_fps = []
        for ep in samples:
            fp = self._extract_audio_fingerprint(ep['file_path'])
            if fp:
                sample_fps.append((ep['id'], fp))

        if len(sample_fps) < 2:
            self._cleanup([f for _, f in sample_fps])
            return None

        # Compute energy profiles for samples
        try:
            sample_profiles = {ep_id: self._compute_energy_profile(fp) for ep_id, fp in sample_fps}
        except Exception as e:
            logger.error(f"Error computing profiles: {e}")
            self._cleanup([f for _, f in sample_fps])
            return None

        # Compare first two to find the reference intro
        ep0_id, ep0_prof = list(sample_profiles.items())[0]
        ep1_id, ep1_prof = list(sample_profiles.items())[1]
        
        result = self._match_pair(ep0_prof, ep1_prof)
        if not result:
            logger.warning("Could not discover intro between sample pair")
            self._cleanup([f for _, f in sample_fps])
            return None

        ep0_start, ep0_end, ep1_start, ep1_end = result
        logger.info(f"Discovered Reference Intro on {ep0_id}: {ep0_start:.1f}s - {ep0_end:.1f}s")
        
        # Extract the exact reference profile slice
        start_chunk = int(ep0_start / self.chunk_s)
        end_chunk = int(ep0_end / self.chunk_s)
        ref_profile = ep0_prof[start_chunk:end_chunk]

        self._cleanup([f for _, f in sample_fps])

        # 2. Scan ALL episodes using the reference profile
        results = {}
        for ep in episodes:
            logger.info(f"Scanning episode {ep['id']} against reference...")
            fp = self._extract_audio_fingerprint(ep['file_path'])
            if not fp:
                continue
                
            try:
                prof = self._compute_energy_profile(fp)
                if prof is not None:
                    # Slide reference profile over episode profile to find best match
                    match = self._find_reference_in_profile(ref_profile, prof)
                    if match:
                        start_s, end_s = match
                        results[ep['id']] = (round(start_s, 1), round(end_s, 1))
                        logger.info(f"Found intro on {ep['id']}: {start_s:.1f}s - {end_s:.1f}s")
            except Exception as e:
                logger.error(f"Error scanning {ep['id']}: {e}")
            finally:
                self._cleanup([fp])

        return results

    def _find_reference_in_profile(self, ref_prof, ep_prof):
        """Find the reference intro profile within a full episode profile"""
        import numpy as np
        
        ref_len = len(ref_prof)
        ep_len = len(ep_prof)
        if ep_len < ref_len:
            return None
            
        ref_n = (ref_prof - np.mean(ref_prof)) / (np.std(ref_prof) + 1e-8)
        
        # Slide ref over ep
        best_sim = -1
        best_idx = 0
        
        windows = np.lib.stride_tricks.as_strided(
            ep_prof, shape=(ep_len - ref_len + 1, ref_len),
            strides=(ep_prof.strides[0], ep_prof.strides[0])
        ).copy()
        
        for i, win in enumerate(windows):
            win_n = (win - np.mean(win)) / (np.std(win) + 1e-8)
            sim = np.dot(ref_n, win_n) / (np.linalg.norm(ref_n) * np.linalg.norm(win_n) + 1e-8)
            if sim > best_sim:
                best_sim = sim
                best_idx = i
                
        if best_sim > self.sim_threshold:
            return (best_idx * self.chunk_s, (best_idx + ref_len) * self.chunk_s)
        return None

    def _compute_energy_profile(self, fp):
        """Load WAV and compute RMS energy profile for a single file."""
        import numpy as np

        chunk_size = int(self.sr * self.chunk_s)
        max_samples = int(self.scan_minutes * 60 * self.sr)
        min_chunks = int(self.min_intro_s / self.chunk_s)

        try:
            with wave.open(fp, 'rb') as wf:
                n_frames = wf.getnframes()
                frames = wf.readframes(n_frames)
                audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32)

                # Normalize to [-1, 1]
                peak = np.max(np.abs(audio))
                if peak > 0:
                    audio = audio / peak

                # Limit to scan window
                audio = audio[:max_samples]

                # Compute RMS energy per chunk
                n_chunks = len(audio) // chunk_size
                if n_chunks < min_chunks:
                    logger.warning(f"Audio too short: {n_chunks} chunks (need {min_chunks})")
                    return None

                chunks = audio[:n_chunks * chunk_size].reshape(n_chunks, chunk_size)
                rms = np.sqrt(np.mean(chunks ** 2, axis=1))
                return rms
        except Exception as e:
            logger.error(f"Error loading WAV {fp}: {e}")
            return None

    def _match_pair(self, p0, p1):
        """
        Find the matching audio segment between two energy profiles.

        Uses a 2D cosine similarity matrix with windowed comparison,
        then finds the longest diagonal line (indicating a common segment
        playing at a consistent time offset between the two episodes).

        Returns:
            tuple: (p0_start_s, p0_end_s, p1_start_s, p1_end_s) or None
        """
        import numpy as np

        # Normalize profiles (zero mean, unit variance)
        p0_n = (p0 - np.mean(p0)) / (np.std(p0) + 1e-8)
        p1_n = (p1 - np.mean(p1)) / (np.std(p1) + 1e-8)

        # Window size in chunks
        win = int(self.window_s / self.chunk_s)
        min_run = int(self.min_intro_s / self.chunk_s)

        n0 = len(p0_n) - win + 1
        n1 = len(p1_n) - win + 1

        if n0 < 1 or n1 < 1:
            return None

        # Build sliding windows using stride tricks (memory-efficient)
        windows0 = np.lib.stride_tricks.as_strided(
            p0_n, shape=(n0, win),
            strides=(p0_n.strides[0], p0_n.strides[0])
        ).copy()
        windows1 = np.lib.stride_tricks.as_strided(
            p1_n, shape=(n1, win),
            strides=(p1_n.strides[0], p1_n.strides[0])
        ).copy()

        # Normalize each window for cosine similarity
        norms0 = np.linalg.norm(windows0, axis=1, keepdims=True)
        norms1 = np.linalg.norm(windows1, axis=1, keepdims=True)
        norms0 = np.maximum(norms0, 1e-8)
        norms1 = np.maximum(norms1, 1e-8)

        w0_normed = windows0 / norms0
        w1_normed = windows1 / norms1

        # Compute cosine similarity matrix: sim[i,j] = similarity(ep0[i], ep1[j])
        sim = w0_normed @ w1_normed.T  # shape (n0, n1)

        logger.info(
            f"Similarity matrix: {sim.shape}, "
            f"max={sim.max():.3f}, mean={sim.mean():.3f}"
        )

        # Find longest diagonal line above threshold
        # A diagonal at offset d means: matching segment where ep1_pos = ep0_pos + d
        best_len = 0
        best_i = 0
        best_j = 0

        total_diags = n0 + n1 - 1
        for d_idx in range(total_diags):
            d = d_idx - (n0 - 1)  # offset: d = j - i

            if d >= 0:
                ii = np.arange(0, min(n0, n1 - d))
                jj = ii + d
            else:
                jj = np.arange(0, min(n1, n0 + d))
                ii = jj - d

            if len(ii) < min_run:
                continue

            # Extract similarity values along this diagonal
            vals = sim[ii, jj]
            above = vals >= self.sim_threshold

            # Find longest contiguous run of True values
            run = 0
            start = 0
            for k in range(len(above)):
                if above[k]:
                    if run == 0:
                        start = k
                    run += 1
                else:
                    if run > best_len:
                        best_len = run
                        best_i = int(ii[start])
                        best_j = int(jj[start])
                    run = 0
            # Don't forget the last run
            if run > best_len:
                best_len = run
                best_i = int(ii[start])
                best_j = int(jj[start])

        # The total matched duration includes the window span
        total_chunks = best_len + win - 1
        total_seconds = total_chunks * self.chunk_s

        logger.info(
            f"Best diagonal: run_length={best_len}, total_duration={total_seconds:.1f}s, "
            f"ep0_offset={best_i * self.chunk_s:.1f}s, ep1_offset={best_j * self.chunk_s:.1f}s"
        )

        # Check minimum duration
        if total_seconds < self.min_intro_s:
            logger.info(f"Match too short: {total_seconds:.1f}s < {self.min_intro_s}s minimum")
            return None

        # Cap at maximum intro duration
        if total_seconds > self.max_intro_s:
            total_chunks = int(self.max_intro_s / self.chunk_s)

        # Convert to timestamps
        ep0_start = best_i * self.chunk_s
        ep0_end = (best_i + total_chunks) * self.chunk_s
        ep1_start = best_j * self.chunk_s
        ep1_end = (best_j + total_chunks) * self.chunk_s

        # Log average similarity for the matched region
        diag_vals = np.array([sim[best_i + k, best_j + k] for k in range(best_len)])
        avg_sim = np.mean(diag_vals)
        logger.info(f"Average cosine similarity in matched region: {avg_sim:.3f}")

        return (ep0_start, ep0_end, ep1_start, ep1_end)

    def _get_episodes(self, series_id, season_number):
        """Get all episodes for a series/season from the database."""
        with get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, file_path, duration
                FROM media
                WHERE series_id = ? AND season_number = ? AND type = 'episode'
                AND file_path IS NOT NULL
                ORDER BY episode_number
            """, (series_id, season_number))
            return [dict(row) for row in cursor.fetchall()]

    def _extract_audio_fingerprint(self, file_path):
        """
        Extract first N minutes of audio as mono WAV at low sample rate.
        Returns path to the temporary WAV file, or None on failure.
        """
        try:
            if not os.path.exists(file_path):
                logger.warning(f"File not found: {file_path}")
                return None

            out_path = os.path.join(
                self.temp_dir,
                f"intro_scan_{random.randint(10000, 99999)}.wav"
            )

            cmd = [
                'ffmpeg', '-y',
                '-i', file_path,
                '-ss', '0',
                '-t', str(self.scan_minutes * 60),
                '-ac', '1',                # mono
                '-ar', str(self.sr),        # low sample rate
                '-vn',                      # no video
                out_path
            ]

            subprocess.run(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                check=True, timeout=120
            )

            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                return out_path
            else:
                logger.warning(f"Output WAV is empty for {file_path}")
                return None
        except subprocess.TimeoutExpired:
            logger.error(f"FFmpeg timed out for {file_path}")
            return None
        except Exception as e:
            logger.error(f"Error extracting audio from {file_path}: {e}")
            return None

    def _cleanup(self, file_paths):
        """Remove temporary WAV files."""
        for fp in file_paths:
            try:
                if fp and os.path.exists(fp):
                    os.remove(fp)
            except Exception:
                pass


# Singleton instance
intro_detector = IntroDetector()
