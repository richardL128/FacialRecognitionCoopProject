-- Append-only audit log protection.
-- Revoke UPDATE and DELETE on the audit_log table from the application role.
-- This should be applied after the initial migration creates the audit_log table.
-- Adjust the role name to match your PostgreSQL application user.

REVOKE UPDATE, DELETE ON audit_log FROM app_user;
