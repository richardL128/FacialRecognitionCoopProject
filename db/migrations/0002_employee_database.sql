CREATE TABLE IF NOT EXISTS employee_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  first_name text NOT NULL,
  name text NOT NULL,
  email text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_profiles_tenant_id ON employee_profiles (tenant_id);

CREATE TABLE IF NOT EXISTS employee_face_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  employee_profile_id uuid NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
  capture_id uuid NOT NULL REFERENCES camera_captures(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_employee_face_profile_capture UNIQUE (employee_profile_id, capture_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_face_library_tenant_id ON employee_face_library (tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_face_library_profile_id ON employee_face_library (employee_profile_id);
