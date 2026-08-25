"""
Face embedding generation and identity matching.

Embedding backend: face_recognition (dlib ResNet-34, 128-dim vectors).
Matching:          Cosine similarity with configurable threshold.
"""

from typing import Optional, Tuple

import numpy as np

from .face_db import FaceDatabase

# ---------------------------------------------------------------------------
# Optional dependency: face_recognition (dlib)
# ---------------------------------------------------------------------------
try:
    import face_recognition as _fr
    FACE_RECOGNITION_AVAILABLE = True
except ImportError:
    _fr = None  # type: ignore
    FACE_RECOGNITION_AVAILABLE = False
    print("[matcher] ⚠ face_recognition not installed.")
    print("[matcher]   Install: pip3 install face_recognition")
    print("[matcher]   Identity matching will be disabled.")


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

def get_embedding(
    rgb_image: np.ndarray,
    face_location: Tuple[int, int, int, int],
) -> Optional[np.ndarray]:
    """
    Generate a 128-dim face embedding for a single detected face.

    Args:
        rgb_image:     Full frame as RGB numpy array (H, W, 3).
        face_location: Bounding box in dlib order: (top, right, bottom, left).

    Returns:
        128-dim float32 numpy array, or None if encoding fails.
    """
    if not FACE_RECOGNITION_AVAILABLE:
        return None

    try:
        encodings = _fr.face_encodings(
            rgb_image,
            known_face_locations=[face_location],
            num_jitters=3,    # higher = more accurate, slower
            model="large",    # "large" = more accurate (same model as enroll.py)
        )
    except Exception as e:
        print(f"[matcher] Encoding error: {e}")
        return None

    return encodings[0] if encodings else None


# ---------------------------------------------------------------------------
# Similarity + matching
# ---------------------------------------------------------------------------

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity in [-1, 1]; higher = more similar."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def match(
    embedding: np.ndarray,
    db: FaceDatabase,
    threshold: float,
) -> Tuple[str, float]:
    """
    Find the best matching identity in the face database.

    For each stored embedding, computes cosine similarity and takes the
    global maximum.  If that maximum meets the threshold, the corresponding
    employee name is returned; otherwise "Unknown".

    Args:
        embedding:  128-dim query embedding.
        db:         Loaded FaceDatabase.
        threshold:  Cosine similarity threshold (e.g. 0.60).

    Returns:
        (identity, best_score) where identity is an employee name or "Unknown",
        and best_score is the highest cosine similarity found (0.0 if db empty).
    """
    if db.is_empty():
        return "Unknown", 0.0

    best_name = "Unknown"
    best_score = -1.0

    for name, employee in db.employees.items():
        for stored_emb in employee.embeddings:
            score = cosine_similarity(embedding, stored_emb)
            if score > best_score:
                best_score = score
                if score >= threshold:
                    best_name = name

    return best_name, max(best_score, 0.0)


# ---------------------------------------------------------------------------
# OpenCV bbox → dlib face_location conversion
# ---------------------------------------------------------------------------

def opencv_bbox_to_dlib(x: int, y: int, w: int, h: int) -> Tuple[int, int, int, int]:
    """
    Convert OpenCV cascade output (x, y, w, h) to dlib face_location
    tuple (top, right, bottom, left) expected by face_recognition.
    """
    return (y, x + w, y + h, x)
