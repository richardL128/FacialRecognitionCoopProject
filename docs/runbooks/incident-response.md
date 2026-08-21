# Incident Response Runbook

> Adapt this template to your team's alerting and communication tools.

## Severity Levels
| Level | Definition | Response Time |
|-------|-----------|--------------|
| P1 — Critical | App down, data loss, security breach | Immediate |
| P2 — High | Major feature broken, data corruption risk | < 1 hour |
| P3 — Medium | Feature degraded, workaround available | < 4 hours |
| P4 — Low | Minor bug, cosmetic issue | Next sprint |

---

## Response Steps

### 1. Detect & Triage
- [ ] Confirm the incident is real (not a false alarm)
- [ ] Determine severity level
- [ ] Assign an incident lead

### 2. Communicate
- [ ] Notify the team in the incident channel
- [ ] If P1/P2: notify affected stakeholders

### 3. Investigate
- [ ] Check application logs (Pino structured logs)
- [ ] Check database for anomalies
- [ ] Check audit log for unexpected mutations
- [ ] Review recent deploys

### 4. Contain
- [ ] Use kill switch env vars to disable affected features if needed
  e.g. `KILL_SWITCH_FEATURE_A=true` (redeploy env config, no code change)
- [ ] Roll back if needed — see [rollback.md](rollback.md)

### 5. Resolve
- [ ] Apply fix
- [ ] Verify fix in production
- [ ] Monitor for 30 minutes

### 6. Post-Incident
- [ ] Write a brief incident summary (what happened, timeline, fix, prevention)
- [ ] Record follow-up prevention work in `PROGRESS.md` and the team issue tracker
