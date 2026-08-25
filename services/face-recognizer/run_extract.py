#!/usr/bin/env python3
"""
Standalone script to extract a face embedding from a single image file.
Used by the regenerate-face-embeddings.ts Node.js script as a fallback
when the face-recognizer HTTP service is unavailable.

Usage:
    python run_extract.py <image_path>

Output (JSON on stdout):
    {"success": true, "embedding": [0.1, 0.2, ...]}   # face detected
    {"success": false, "error": "No face detected"}     # no face
"""

import argparse
import json
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract face embedding from an image.")
    parser.add_argument("image_path", type=str, help="Path to the input image file")
    args = parser.parse_args()

    try:
        # Import FaceAnalysis (bundled in Docker image, avoids HF dynamic download)
        from inference import FaceAnalysis

        # Lazy-initialise FaceAnalysis once per script invocation.
        # In subprocess mode this is fine; in long-running services use the singleton pattern.
        app = FaceAnalysis()

        embedding = app.process_image(args.image_path)

        # Convert to list (handles torch.Tensor, numpy array, etc.)
        if hasattr(embedding, "cpu"):
            embedding = embedding.cpu()
        if hasattr(embedding, "numpy"):
            embedding = embedding.numpy()

        vector = embedding.flatten().tolist()

        if not vector or len(vector) == 0:
            print(json.dumps({"success": False, "error": "Empty embedding extracted"}))
            sys.exit(1)

        # L2-normalise
        norm = sum(v * v for v in vector) ** 0.5
        if norm > 0:
            vector = [v / norm for v in vector]

        print(json.dumps({"success": True, "embedding": vector}))
        sys.exit(0)

    except RuntimeError as exc:
        # No face detected or model error
        print(json.dumps({"success": False, "error": str(exc)}))
        sys.exit(1)
    except Exception as exc:
        print(json.dumps({"success": False, "error": f"Unexpected error: {exc}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
