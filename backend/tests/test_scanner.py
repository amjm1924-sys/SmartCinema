import pytest
import sys
import os
from unittest.mock import patch, MagicMock
from pathlib import Path

from scanner import MediaScanner

@pytest.fixture
def scanner():
    return MediaScanner()

def test_clean_filename(scanner):
    # Test Arabic/English mix and site name removal
    dirty = "Movie.Name.2024.Akwam.720p.BluRay.mp4"
    clean = scanner._clean_filename(dirty)
    assert "Akwam" not in clean
    assert "720p" not in clean
    assert "BluRay" not in clean

def test_detect_quality(scanner):
    assert scanner._detect_quality("Movie.1080p.mp4") == "1080p"
    assert scanner._detect_quality("Movie.4K.mp4") == "4K"
    assert scanner._detect_quality("Movie.720p.mp4") == "720p"

def test_detect_episode(scanner):
    # Test S01E01 pattern
    result = scanner._detect_episode("Series.S01E05.HD.mp4", "Series Folder")
    assert result is not None
    assert result['season'] == 1
    assert result['episode'] == 5

@patch('os.path.getsize', return_value=100 * 1024 * 1024)
def test_parse_media_file_movie(mock_getsize, scanner):
    # Mocking Path.exists, Path.is_file, and Path.stat
    with patch.object(Path, 'exists', return_value=True):
        with patch.object(Path, 'is_file', return_value=True):
            with patch.object(Path, 'stat', return_value=MagicMock(st_size=100 * 1024 * 1024)):
                # Also mock get_video_info from ffmpeg_utils
                with patch('ffmpeg_utils.get_video_info', return_value={'duration': 120, 'width': 1920, 'height': 1080}):
                    # Also mock classification
                    with patch('classification.classify_media_type', return_value='movie'):
                        result = scanner.parse_media_file(Path("C:/Movies/Inception.2010.1080p.mp4"))
                        assert result is not None
                        assert result['title'] == "Inception"
                        assert result['year'] == 2010
                        assert result['type'] == 'movie'


def test_clean_filename_no_year(scanner):
    assert scanner._clean_filename('Inception.1080p.mkv') == 'Inception'

def test_detect_quality_4k(scanner):
    assert scanner._detect_quality('Movie.2160p.4K.mkv') == '4K'
