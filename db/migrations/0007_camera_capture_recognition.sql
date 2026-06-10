ALTER TABLE camera_captures
  ADD COLUMN IF NOT EXISTS recognition_status       text,
  ADD COLUMN IF NOT EXISTS recognized_employee_id   uuid REFERENCES employee_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recognition_confidence   float4,
  ADD COLUMN IF NOT EXISTS recognized_at            timestamptz;

CREATE INDEX IF NOT EXISTS idx_camera_captures_recognized_employee
  ON camera_captures (tenant_id, recognized_employee_id)
  WHERE recognized_employee_id IS NOT NULL;
