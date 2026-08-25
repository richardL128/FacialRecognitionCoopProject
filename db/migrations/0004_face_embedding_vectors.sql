CREATE TABLE IF NOT EXISTS face_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_profile_id uuid NOT NULL REFERENCES employee_profiles(id),
  capture_id uuid NOT NULL REFERENCES camera_captures(id),
  model_version_id uuid REFERENCES face_model_versions(id) ON DELETE SET NULL,
  model_key text NOT NULL,
  embedding_dim integer NOT NULL,
  embedding jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_face_embedding_capture_model UNIQUE (capture_id, model_key)
);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_tenant_active
  ON face_embeddings (tenant_id, active);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_tenant_employee
  ON face_embeddings (tenant_id, employee_profile_id);

CREATE INDEX IF NOT EXISTS idx_face_embeddings_tenant_model_active
  ON face_embeddings (tenant_id, model_key, active);

CREATE TABLE IF NOT EXISTS face_embedding_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_profile_id uuid NOT NULL REFERENCES employee_profiles(id),
  capture_id uuid NOT NULL REFERENCES camera_captures(id),
  requested_by uuid REFERENCES users(id),
  model_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  reason text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_embedding_jobs_tenant_id
  ON face_embedding_jobs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_face_embedding_jobs_status_created_at
  ON face_embedding_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_face_embedding_jobs_tenant_model_status
  ON face_embedding_jobs (tenant_id, model_key, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_face_embedding_jobs_active_per_capture_model
  ON face_embedding_jobs (capture_id, model_key)
  WHERE status IN ('pending', 'running');
