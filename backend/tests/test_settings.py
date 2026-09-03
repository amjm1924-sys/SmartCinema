import pytest
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app
from database import init_db, get_connection

# client fixture is now provided by conftest.py

def test_get_settings(client):
    response = client.get('/api/settings')
    assert response.status_code == 200
    data = response.get_json()
    assert 'auto_scan' in data

def test_auto_scan_toggle(client):
    response = client.post('/api/settings/auto_scan', json={'enabled': True})
    assert response.status_code == 200
    assert response.get_json()['success'] == True

def test_api_docs_route(client):
    response = client.get('/api/media', query_string={'page': 1, 'limit': 1})
    assert response.status_code == 200
    data = response.get_json()
    assert 'data' in data
    assert 'total' in data
