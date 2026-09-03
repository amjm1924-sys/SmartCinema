import pytest
import sys
import os
import json

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app
from database import init_db

# client fixture is now provided by conftest.py

def test_api_health(client):
    response = client.get('/api/settings')
    assert response.status_code == 200
    assert 'auto_scan' in response.get_json()

def test_get_media_list(client):
    response = client.get('/api/media?limit=5')
    assert response.status_code == 200
    data = response.get_json()
    assert 'data' in data
    assert 'total' in data
    assert isinstance(data['data'], list)

def test_search_endpoint(client):
    response = client.get('/api/media?search=a')
    assert response.status_code == 200
    data = response.get_json()
    assert 'data' in data

def test_media_details_not_found(client):
    response = client.get('/api/media/99999999')
    assert response.status_code in [404, 200]
    
def test_dashboard_stats(client):
    response = client.get('/api/admin/stats')
    assert response.status_code == 200
    data = response.get_json()
    assert 'media' in data
    assert 'system' in data

def test_recent_media(client):
    response = client.get('/api/history/recent?limit=3')
    assert response.status_code == 200
    data = response.get_json()
    assert 'items' in data or isinstance(data, list)

def test_collections_api(client):
    response = client.get('/api/collections')
    assert response.status_code == 200
    assert isinstance(response.get_json(), list)

def test_downloads_flow(client):
    # 1. Start a download (ID 1)
    response = client.post('/api/downloads/1')
    assert response.status_code in [200, 404] # 404 if media 1 doesn't exist
    if response.status_code == 200:
        job_id = response.get_json().get('job_id')
        if job_id:
            # 2. Check status
            response = client.get(f'/api/downloads/status/{job_id}')
            assert response.status_code == 200

def test_trailers_status(client):
    # Test for non-existent media
    response = client.get('/api/trailers/999999/status')
    assert response.status_code == 200 # Should return "not_started" JSON
    data = response.get_json()
    assert data['cached'] is False
    assert data['status'] == 'not_started'

def test_search_case_insensitive(client):
    # Search for "A" and "a" should return same results (broadly)
    res1 = client.get('/api/media?search=A')
    res2 = client.get('/api/media?search=a')
    assert res1.status_code == 200
    assert res2.status_code == 200
    assert len(res1.get_json()['data']) == len(res2.get_json()['data'])
