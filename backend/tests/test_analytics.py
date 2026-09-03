import pytest
import json

def test_watch_history_flow(client):
    # 1. Record start
    response = client.post('/api/analytics/record/start', json={'media_id': 1})
    assert response.status_code == 200
    data = response.get_json()
    event_id = data['event_id']
    
    # 2. Record end
    response = client.post('/api/analytics/record/end', json={
        'event_id': event_id,
        'duration_watched': 120,
        'bytes_streamed': 1024 * 1024
    })
    assert response.status_code == 200
    assert response.get_json()['success'] is True

def test_analytics_overview(client):
    response = client.get('/api/analytics/overview')
    assert response.status_code == 200
    data = response.get_json()
    assert 'total_events' in data
    assert 'top_media' in data

def test_analytics_genres(client):
    response = client.get('/api/analytics/genres')
    assert response.status_code == 200
    data = response.get_json()
    assert 'genres' in data

def test_analytics_bandwidth(client):
    response = client.get('/api/analytics/bandwidth')
    assert response.status_code == 200
    data = response.get_json()
    assert 'bandwidth' in data
