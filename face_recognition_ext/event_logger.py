"""
Event enrichment and JSON Lines logging.

Each recognition event is a single JSON object written as one line to a
JSONL file (append-only).  The schema is:

    {
        "timestamp":    <int>           UTC milliseconds since epoch
        "frame_id":     <int>           monotonically increasing frame counter
        "face_id":      <int>           0-indexed per frame
        "identity":     <str>           employee name or "Unknown"
        "confidence":   <float>         cosine similarity [0, 1]
        "profile_image": <str|absent>   path to profile.jpg (known identities only)
    }
"""

import json
import os
from typing import Any, Dict, Optional


# ---------------------------------------------------------------------------
# Event builder
# ---------------------------------------------------------------------------

def build_event(
    timestamp_ms: int,
    frame_id: int,
    face_id: int,
    identity: str,
    confidence: float,
    profile_image: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Construct an enriched recognition event dictionary.

    profile_image is omitted entirely for Unknown identities per spec.
    """
    event: Dict[str, Any] = {
        "timestamp": timestamp_ms,
        "frame_id": frame_id,
        "face_id": face_id,
        "identity": identity,
        "confidence": round(confidence, 4),
    }
    if identity != "Unknown" and profile_image is not None:
        event["profile_image"] = profile_image
    return event


# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------

class EventLogger:
    """
    Append-only JSON Lines logger.

    Each call to append() writes one event as a single line.
    The log directory is created on first write if it does not exist.
    """

    def __init__(self, log_file: str) -> None:
        self.log_file = log_file
        self._ensure_dir()

    def append(self, event: Dict[str, Any]) -> None:
        """Write one event to the log file."""
        with open(self.log_file, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(event, ensure_ascii=False) + "\n")

    def _ensure_dir(self) -> None:
        log_dir = os.path.dirname(self.log_file)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
