# Stage 1: Build requirements
FROM python:3.11-slim AS builder
WORKDIR /app

# Install build dependencies for face_recognition and dlib
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# Stage 2: Install dependencies
FROM python:3.11-slim AS installer
WORKDIR /app

# Install runtime libraries for OpenCV (if needed) and dlib
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache /wheels/*

# Stage 3: Runner
FROM python:3.11-slim AS runner
WORKDIR /app

# Install runtime dependencies needed for python packages
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from installer
COPY --from=installer /usr/local/lib/python3.11/site-packages/ /usr/local/lib/python3.11/site-packages/
COPY --from=installer /usr/local/bin/ /usr/local/bin/

# Copy application code
COPY . .

# Environment variables defaults
ENV APP_NAME="AI-Driven Classroom Engagement"
ENV DEBUG="false"
ENV CORS_ORIGINS="http://localhost:3000"
# Removed sensitive default variables since they are injected at runtime via docker-compose
ENV JITSI_DOMAIN="8x8.vc"
ENV JITSI_ROOM_CLAIM="*"
ENV JITSI_ROOM_REGEX="false"

# Expose port and run the application
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
