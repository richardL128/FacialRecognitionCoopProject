import os
from dataclasses import dataclass, field


@dataclass
class Config:
    # Path to employees directory
    employees_dir: str = field(default_factory=lambda: os.environ.get(
        "FACE_DB_DIR", "/home/payevo/employees"
    ))
    # Path to JSONL log file
    log_file: str = field(default_factory=lambda: os.environ.get(
        "FACE_LOG_FILE", "/home/payevo/logs/detections.jsonl"
    ))
    # Cosine similarity threshold: >= this value → known identity
    # dlib 128-dim embeddings: ~0.70-0.75 is a safe 'same person' boundary
    similarity_threshold: float = field(default_factory=lambda: float(
        os.environ.get("FACE_SIMILARITY_THRESHOLD", "0.90")
    ))  # updated from 0.45
    # API endpoint for dashboard (existing behavior)
    api_url: str = field(default_factory=lambda: os.environ.get(
        "FACE_DETECT_API_URL", "http://localhost:3000/api/camera/detections"
    ))
    # Seconds between captures
    capture_interval: float = field(default_factory=lambda: float(
        os.environ.get("FACE_DETECT_INTERVAL", "1.0")
    ))

    @classmethod
    def from_env(cls) -> "Config":
        return cls()
