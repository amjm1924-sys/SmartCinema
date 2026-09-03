# Use an official lightweight Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (ffmpeg is essential for video/audio transcoding)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application source code
COPY . .

# Expose port
EXPOSE 5000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=5000

# Run the Flask app
CMD ["python", "app.py"]
