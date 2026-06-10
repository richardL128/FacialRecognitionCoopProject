ALTER TABLE camera_captures
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'dashboard';

CREATE INDEX IF NOT EXISTS idx_camera_captures_tenant_source_created
  ON camera_captures (tenant_id, source, created_at DESC, id DESC);
