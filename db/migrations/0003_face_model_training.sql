CREATE TABLE IF NOT EXISTS face_model_training_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  requested_by uuid REFERENCES users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  reason text,
  data_dir text,
  output_dir text,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_model_training_jobs_tenant_id
  ON face_model_training_jobs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_face_model_training_jobs_status_created_at
  ON face_model_training_jobs (status, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_face_model_training_jobs_active_per_tenant
  ON face_model_training_jobs (tenant_id)
  WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS face_model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  source_job_id uuid REFERENCES face_model_training_jobs(id) ON DELETE SET NULL,
  model_path text NOT NULL,
  checkpoint_path text,
  data_dir text NOT NULL,
  dataset_class_count integer NOT NULL,
  dataset_image_count integer NOT NULL,
  train_epochs integer NOT NULL,
  val_accuracy double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_face_model_versions_tenant_created_at
  ON face_model_versions (tenant_id, created_at DESC);
