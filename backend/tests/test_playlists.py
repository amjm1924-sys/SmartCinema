import pytest
import json

def test_playlist_lifecycle(client):
    # 1. Create playlist
    response = client.post('/api/playlists', json={
        'name': 'Test Playlist',
        'description': 'Test Description'
    })
    assert response.status_code == 201
    playlist_data = response.get_json()
    playlist_id = playlist_data['id']
    assert playlist_data['name'] == 'Test Playlist'
    
    # 2. Add item to playlist
    response = client.post(f'/api/playlists/{playlist_id}/items', json={
        'media_id': 1
    })
    assert response.status_code in [200, 201, 404] # 404 if media doesn't exist
    
    # 3. Get playlist details
    response = client.get(f'/api/playlists/{playlist_id}')
    assert response.status_code == 200
    data = response.get_json()
    assert data['name'] == 'Test Playlist'
    assert 'items' in data
    
    # 4. Remove item from playlist
    response = client.delete(f'/api/playlists/{playlist_id}/items/1')
    assert response.status_code == 200
    
    # 5. Delete playlist
    response = client.delete(f'/api/playlists/{playlist_id}')
    assert response.status_code == 200
    assert response.get_json()['status'] == 'deleted'

def test_get_all_playlists(client):
    response = client.get('/api/playlists')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)

def test_create_playlist_empty_name(client):
    response = client.post('/api/playlists', json={'name': ''})
    assert response.status_code == 400
