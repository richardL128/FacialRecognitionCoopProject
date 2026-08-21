# `services/face-recognizer/` guide

This FastAPI service is an internal inference boundary. It accepts an image and returns a normalized embedding; it does not decide the employee match, authorize users, or expose a public API.

Keep input handling bounded, return stable error semantics for no-face versus service failure, avoid logging image data or embeddings, and pin/review model dependencies. Any model, preprocessing, embedding dimension, or normalization change requires a new model key, migration/backfill plan, threshold evaluation, and integration tests with the TypeScript client.

