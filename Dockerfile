# Autokong WebUI: runs pipeline (SongKong via Docker) and serves Flask + React UI.
# Requires: docker socket and music/songkong paths mounted.

# Stage 1: build React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python app + frontend build
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://get.docker.com | sh

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY Autokong.py .
COPY pipeline_audit.py .
COPY config_manager.py .
COPY settings_db.py .
COPY app.py .

RUN mkdir -p frontend/build
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Data dir for config.json and runs.db (override with -v)
ENV AUTOKONG_DATA_DIR=/app/data
ENV SONGKONG_CONFIG_DIR=/songkong

VOLUME /app/data

EXPOSE 5000

CMD ["python", "app.py"]
