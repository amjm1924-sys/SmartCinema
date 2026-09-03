import pytest
import json

def test_get_top_cast(client):
    response = client.get('/api/cast/top?limit=5')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)

def test_all_actors_search(client):
    response = client.get('/api/cast/all?search=a&page=1&limit=5')
    assert response.status_code == 200
    data = response.get_json()
    assert 'actors' in data
    assert 'total' in data

def test_actor_details_not_found(client):
    response = client.get('/api/cast/999999')
    assert response.status_code == 404

def test_full_filmography_not_found(client):
    response = client.get('/api/cast/999999/full-filmography')
    assert response.status_code == 404
