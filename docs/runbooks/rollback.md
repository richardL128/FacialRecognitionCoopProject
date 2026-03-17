# Rollback Runbook

> Fill this in with your specific rollback procedure before going to production.

## When to Rollback
- Critical bug introduced in the latest deploy
- Data integrity issue discovered
- Performance regression causing timeouts

## Steps

### 1. Identify the last known good version
```bash
# Check your container registry for the previous image tag
# e.g. git tag -l, or your CI/CD pipeline history
```

### 2. Re-deploy the previous image
```bash
# Re-deploy previous container image
# [Update with your platform-specific command]
```

### 3. Database rollback (if schema migration was included)
Database rollbacks require manual steps — Prisma does not auto-rollback.
```bash
# Review the migration that was applied
# Write a compensating migration or restore from backup
```

> WARNING: Never roll back the audit_log table schema.
> The audit log is append-only — data must never be deleted.

### 4. Verify the rollback
- [ ] App starts and health check passes
- [ ] Spot-check affected functionality
- [ ] Monitor error rate for 10 minutes

### 5. Notify stakeholders
- [ ] Update incident channel
- [ ] Document the root cause
