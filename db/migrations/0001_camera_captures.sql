CREATE TABLE IF NOT EXISTS camera_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  user_id uuid NOT NULL REFERENCES users(id),
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_camera_captures_tenant_id ON camera_captures (tenant_id);
CREATE INDEX IF NOT EXISTS idx_camera_captures_user_id ON camera_captures (user_id);
