import pytest
import sys
import os
from pathlib import Path

# Add the backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app
from database import init_db

@pytest.fixture
def client():
    app.config['TESTING'] = True
    # Use a temporary database for testing if needed, 
    # but for now we'll use the app's default testing behavior
    with app.test_client() as client:
        with app.app_context():
            init_db()
        yield client
