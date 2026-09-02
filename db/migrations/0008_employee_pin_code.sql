-- Adds employee_profiles.pin_code.
--
-- The column is declared in prisma/schema.prisma (EmployeeProfile.pinCode) but
-- was never created by a SQL migration — it reached the original instance via
-- Prisma rather than through db/migrations/. Any database built from the
-- migration files alone is therefore missing it, which breaks:
--   * GET   /api/feature-a/employees          (selects ep.pin_code)
--   * PATCH /api/feature-a/employees/[id]/pin (reads and writes pin_code)
--   * POST  /api/camera/verify-pin            (reads pin_code)
--
-- Stores a hash produced by hashPin() — never a plaintext PIN.

ALTER TABLE employee_profiles
  ADD COLUMN IF NOT EXISTS pin_code text;
