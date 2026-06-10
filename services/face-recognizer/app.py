import importlib.util
import io
import os
from pathlib import Path
from typing import Any, Optional

import numpy as np
import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

app = FastAPI(title="Face Recognizer", version="0.1.0")

MODEL_PROVIDER = os.getenv("MODEL_PROVIDER", "huggingface")
HF_REPO_ID = os.getenv("HF_REPO_ID", "biometric-ai-lab/Face_Recognition")
INFERENCE_SCRIPT_URL = os.getenv(
    "INFERENCE_SCRIPT_URL",
    f"https://huggingface.co/{HF_REPO_ID}/resolve/main/inference.py",
)
INFERENCE_SCRIPT_PATH = Path("/app/inference.py")

_face_analysis: Optional[Any] = None
_startup_error: Optional[str] = None


def _download_inference_script() -> None:
    if INFERENCE_SCRIPT_PATH.exists():
        return

    response = requests.get(INFERENCE_SCRIPT_URL, timeout=30)
    response.raise_for_status()
    INFERENCE_SCRIPT_PATH.write_bytes(response.content)


def _load_face_analysis() -> Any:
    spec = importlib.util.spec_from_file_location("remote_inference", str(INFERENCE_SCRIPT_PATH))
    if not spec or not spec.loader:
        raise RuntimeError("Failed to load downloaded inference.py")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    if not hasattr(module, "FaceAnalysis"):
        raise RuntimeError("FaceAnalysis class was not found in inference.py")

    # The hosted checkpoint may store weights under model_state_dict/state_dict.
    # Patch torch.load in module scope so FaceAnalysis can load both formats.
    if hasattr(module, "torch") and hasattr(module.torch, "load"):
        original_torch_load = module.torch.load

        def compatible_torch_load(*args: Any, **kwargs: Any) -> Any:
            checkpoint = original_torch_load(*args, **kwargs)
            if isinstance(checkpoint, dict):
                if "model" in checkpoint and isinstance(checkpoint["model"], dict):
                    return checkpoint
                for key in ("model_state_dict", "state_dict", "weights", "net"):
                    if key in checkpoint and isinstance(checkpoint[key], dict):
                        return {"model": checkpoint[key]}
            return checkpoint

        module.torch.load = compatible_torch_load

    return module.FaceAnalysis()


def _to_pil_image(raw_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(raw_bytes)).convert("RGB")


def _extract_embedding_with_fallback(face_analysis: Any, image_source: Any) -> np.ndarray:
    # Wrapper compatibility for multiple inference.py variants.
    if hasattr(face_analysis, "get_embedding"):
        embedding = face_analysis.get_embedding(image_source)
    elif hasattr(face_analysis, "embed"):
        embedding = face_analysis.embed(image_source)
    elif hasattr(face_analysis, "analyze"):
        result = face_analysis.analyze(image_source)
        embedding = result.get("embedding") if isinstance(result, dict) else None
    elif hasattr(face_analysis, "get"):
        faces = face_analysis.get(image_source)
        if not faces:
            raise RuntimeError("No face detected")
        first = faces[0]
        if isinstance(first, dict) and "embedding" in first:
            embedding = first["embedding"]
        else:
            embedding = getattr(first, "embedding", None)
    elif hasattr(face_analysis, "process_image"):
        embedding = face_analysis.process_image(image_source)
    else:
        raise RuntimeError("No supported embedding method found on FaceAnalysis")

    if embedding is None:
        raise RuntimeError("Embedding was empty")

    if hasattr(embedding, "detach"):
        embedding = embedding.detach()
    if hasattr(embedding, "cpu"):
        embedding = embedding.cpu()
    if hasattr(embedding, "numpy"):
        embedding = embedding.numpy()

    vector = np.asarray(embedding, dtype=np.float32).reshape(-1)
    if vector.size == 0:
        raise RuntimeError("Embedding vector was empty")

    return vector


@app.on_event("startup")
def _startup() -> None:
    global _face_analysis, _startup_error

    if MODEL_PROVIDER != "huggingface":
        _startup_error = f"Unsupported MODEL_PROVIDER: {MODEL_PROVIDER}"
        return

    try:
        _download_inference_script()
        _face_analysis = _load_face_analysis()
    except Exception as exc:  # pragma: no cover - startup path
        _startup_error = str(exc)
        _face_analysis = None


@app.get("/health")
def health() -> JSONResponse:
    ok = _face_analysis is not None
    payload = {
        "ok": _face_analysis is not None,
        "provider": MODEL_PROVIDER,
        "startupError": _startup_error,
    }
    return JSONResponse(status_code=(200 if ok else 503), content=payload)


@app.post("/embed")
async def embed(image: UploadFile = File(...)) -> dict[str, Any]:
    if _face_analysis is None:
        raise HTTPException(status_code=503, detail=_startup_error or "FaceAnalysis not initialized")

    try:
        raw = await image.read()
        image_pil = _to_pil_image(raw)

        try:
            embedding = _extract_embedding_with_fallback(_face_analysis, image_pil)
        except (TypeError, ValueError):
            # Only retry with numpy array for format/type incompatibility.
            # RuntimeError (e.g. "No face detected") must propagate.
            embedding = _extract_embedding_with_fallback(_face_analysis, np.asarray(image_pil))

        norm = float(np.linalg.norm(embedding))
        if norm > 0:
            embedding = embedding / norm

        return {
            "success": True,
            "embedding": embedding.astype(np.float32).tolist(),
            "dimension": int(embedding.shape[0]),
        }
    except HTTPException:
        raise
    except Exception as exc:
        print(f"embed error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
