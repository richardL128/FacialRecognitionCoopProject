-- 0006_pgvector_embeddings.sql
-- Adds pgvector support, a native vector column on face_embeddings, and the
-- face_employee_centroids table used by the centroid-first recognition pipeline.

-- ─── Extension ──────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── face_embeddings: add native vector column ──────────────────────────────
-- embedding_vec is nullable so existing rows are valid before backfill runs.
-- The column is set to NOT NULL (via backfill + constraint) in a future migration
-- once all rows have been converted.

ALTER TABLE face_embeddings
  ADD COLUMN IF NOT EXISTS embedding_vec vector(512);

-- HNSW index for cosine ANN on active embeddings per tenant + model.
-- Filtered index keeps index compact; non-active rows are excluded.
CREATE INDEX IF NOT EXISTS idx_face_embeddings_vec_hnsw
  ON face_embeddings
  USING hnsw (embedding_vec vector_cosine_ops)
  WHERE active = true;

-- ─── face_employee_centroids ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS face_employee_centroids (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  employee_profile_id uuid NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  model_key           text NOT NULL,
  centroid_vec        vector(512) NOT NULL,
  sample_count        integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_face_employee_centroid UNIQUE (tenant_id, employee_profile_id, model_key)
);

-- HNSW cosine index: centroid scan is the fast path in Stage A of recognition.
CREATE INDEX IF NOT EXISTS idx_face_employee_centroids_vec_hnsw
  ON face_employee_centroids
  USING hnsw (centroid_vec vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_face_employee_centroids_tenant_model
  ON face_employee_centroids (tenant_id, model_key);
