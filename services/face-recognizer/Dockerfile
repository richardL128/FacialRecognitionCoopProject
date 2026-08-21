FROM python:3.11-slim AS model-downloader

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget curl git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Download models at build time so the runtime image has them bundled.
# This avoids downloading from HuggingFace on every container restart.
COPY inference.py ./
RUN mkdir -p models && \
    python -c "from inference import _ensure_models_downloaded; _ensure_models_downloaded()" || true

# ─── Runtime stage (no HF dependency) ──────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy bundled models from the downloader stage.
COPY --from=model-downloader /app/models ./models
COPY app.py ./
COPY inference.py ./

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
