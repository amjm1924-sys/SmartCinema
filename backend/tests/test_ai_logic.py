import pytest
import json
from unittest.mock import patch

def test_ai_status(client):
    response = client.get('/api/ai/status')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, list)

def test_ai_recommendations_together(client):
    with patch('ai_recs.get_recommendations', return_value=[]):
        response = client.post('/api/ai/recommend', json={'media_id': 1, 'provider': 'together'})
        assert response.status_code == 200

def test_ai_recommendations_mock(client):
    # Mocking recommendations since it hit external APIs
    with patch('ai_recs.get_recommendations', return_value=[{'id': 100, 'title': 'AI Recommended'}]):
        response = client.post('/api/ai/recommend', json={'media_id': 1})
        assert response.status_code == 200
        data = response.get_json()
        assert isinstance(data, list)

def test_ai_keys_management(client):
    # 1. Add key
    response = client.post('/api/ai/keys', json={
        'provider': 'huggingface',
        'api_key': 'hf_test_key'
    })
    assert response.status_code in [200, 201]
    
    # 2. Delete key (Assuming ID 1 for now or skip if ID is dynamic)
    # response = client.delete('/api/ai/keys/1')
    # assert response.status_code == 200
