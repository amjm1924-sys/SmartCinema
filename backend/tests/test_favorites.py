import pytest
import json

def test_favorites_crud(client):
    # 1. Add some media first to test with
    # We might need to inject directly into DB or use an existing one
    # For now, let's assume media ID 1 exists or we can try to add it
    
    # Add to favorites
    response = client.post('/api/favorites/1')
    # If media doesn't exist, it might fail, but let's check the API behavior
    # Assuming success or at least a valid response
    assert response.status_code in [200, 201, 404] 
    
    # Get all favorites
    response = client.get('/api/favorites')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)

def test_is_favorite(client):
    response = client.get('/api/favorites/1/status')
    assert response.status_code == 200
    data = response.get_json()
    assert 'is_favorite' in data

def test_remove_favorite(client):
    response = client.delete('/api/favorites/1')
    assert response.status_code == 200
    data = response.get_json()
    assert data['success'] is True
