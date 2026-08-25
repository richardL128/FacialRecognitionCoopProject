import io
import os
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

# Import the local FaceAnalysis class directly (bundled in the Docker image).
# This avoids dynamic download of inference.py from HuggingFace at startup.
from inference import FaceAnalysis  # noqa: E402

# ─── Rate Limiting Configuration ──────────────────────────────────────────────
# Configured via environment variables for flexibility without code changes.
#   RATE_LIMIT_WINDOW_SECONDS — sliding window duration (default: 60)
#   RATE_LIMIT_MAX_REQUESTS   — max requests per window per IP (default: 120)
#   RATE_LIMIT_EMBED_MAX      — stricter limit for /embed endpoint (default: 30)

RATE_LIMIT_WINDOW = int(os.environ.get("RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_MAX = int(os.environ.get("RATE_LIMIT_MAX_REQUESTS", "120"))
RATE_LIMIT_EMBED_MAX = int(os.environ.get("RATE_LIMIT_EMBED_MAX", "30"))

limiter = Limiter(key_func=get_remote_address, default_limits=[f"{RATE_LIMIT_MAX} per {RATE_LIMIT_WINDOW} seconds"])

app = FastAPI(title="Face Recognizer", version="1.0.0")
app.state.limiter = limiter


def _rate_limit_for_path(path: str) -> str | None:
    """Return a rate limit string for the given path, or None for health checks."""
    if path == "/health":
        return None  # Health checks should never be rate-limited
    if path == "/embed":
        return f"{RATE_LIMIT_EMBED_MAX} per {RATE_LIMIT_WINDOW} seconds"
    return f"{RATE_LIMIT_MAX} per {RATE_LIMIT_WINDOW} seconds"


_face_analysis: Any | None = None
_startup_error: str | None = None


def _to_pil_image(raw_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(raw_bytes)).convert("RGB")


@app.on_event("startup")
def _startup() -> None:
    global _face_analysis, _startup_error

    try:
        _face_analysis = FaceAnalysis()
    except Exception as exc:  # pragma: no cover - startup path
        _startup_error = str(exc)
        _face_analysis = None


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc: RateLimitExceeded):
    """Handle rate limit exceeded errors with proper headers."""
    return JSONResponse(
        status_code=429,
        content={
            "error": "RATE_LIMIT_EXCEEDED",
            "message": "Too many requests. Please try again later.",
        },
        headers={
            "Retry-After": str(RATE_LIMIT_WINDOW),
        },
    )


@app.get("/health")
def health() -> JSONResponse:
    return JSONResponse(
        status_code=200 if _face_analysis else 503,
        content={
            "ok": _face_analysis is not None,
            "startupError": _startup_error,
        },
    )


@app.post("/embed")
@limiter.limit(_rate_limit_for_path("/embed"))
async def embed(request: Request, image: UploadFile = File(...)) -> dict[str, Any]:
    if _face_analysis is None:
        raise HTTPException(status_code=503, detail=_startup_error or "FaceAnalysis not initialized")

    try:
        raw = await image.read()
        image_pil = _to_pil_image(raw)

        # process_image returns a torch.Tensor embedding.
        embedding = _face_analysis.process_image(image_pil)

        # Detach / move to CPU / convert to numpy (safe no-ops if not applicable).
        if hasattr(embedding, "detach"):
            embedding = embedding.detach()
        if hasattr(embedding, "cpu"):
            embedding = embedding.cpu()
        if hasattr(embedding, "numpy"):
            embedding = embedding.numpy()

        vector = np.asarray(embedding, dtype=np.float32).reshape(-1)
        if vector.size == 0:
            raise HTTPException(status_code=400, detail="No face detected. Please retake photo.")

        # L2-normalise before returning (centroids expect normalised vectors).
        norm = float(np.linalg.norm(vector))
        if norm > 0:
            vector = vector / norm

        return {
            "success": True,
            "embedding": vector.tolist(),
            "dimension": int(vector.shape[0]),
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"embed error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
