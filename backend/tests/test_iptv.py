import pytest
import json

def test_iptv_playlists(client):
    # 1. Get playlists
    response = client.get('/api/iptv/playlists')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)
    
    # 2. Add playlist
    response = client.post('/api/iptv/playlists', json={
        'name': 'Test IPTV',
        'url': 'http://example.com/playlist.m3u'
    })
    assert response.status_code == 200
    assert response.get_json()['success'] is True

def test_iptv_groups_and_channels(client):
    # These currently return empty lists or TODOs
    response = client.get('/api/iptv/groups')
    assert response.status_code == 200
    assert isinstance(response.get_json(), list)
    
    response = client.get('/api/iptv/channels')
    assert response.status_code == 200
    assert isinstance(response.get_json(), list)
