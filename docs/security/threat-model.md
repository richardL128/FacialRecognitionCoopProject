# Threat Model

> Complete this before handling any user data in production.
> Update whenever the architecture changes significantly.

## Assets to Protect
| Asset | Sensitivity | Notes |
|-------|------------|-------|
| User credentials | Critical | Never stored — delegated to identity provider |
| PII / sensitive fields | High | Column-level encryption required |
| Audit log | High | Append-only; integrity critical |
| API keys / secrets | Critical | Environment variables only; never in code |
| Tenant data | High | Strict isolation required |

## Threat Actors
| Actor | Motivation | Capability |
|-------|-----------|-----------|
| External attacker | Data theft, disruption | Low-to-medium |
| Malicious insider | Data exfiltration | High |
| Compromised dependency | Supply-chain attack | Medium |
| Unauthenticated user | IDOR, misconfiguration exploit | Low |

## Key Threats & Mitigations

### Broken Access Control (OWASP A01)
- **Threat:** User accesses another tenant's data
- **Mitigation:** `belongsToTenant()` check on every resource; return 404 (not 403)

### Injection (OWASP A03)
- **Threat:** SQL injection via user input
- **Mitigation:** Prisma ORM (parameterised queries); Zod validation on all inputs

### Sensitive Data Exposure (OWASP A02)
- **Threat:** PII leaked in logs, URLs, or client-side state
- **Mitigation:** Pino redact config; no sensitive data in URLs; server-side only

### Security Misconfiguration (OWASP A05)
- **Threat:** Secrets committed to git; `.env.local` exposed
- **Mitigation:** `.gitignore` blocks `.env*`; secrets in environment variables only

### Identification & Auth Failures (OWASP A07)
- **Threat:** Weak session management; token theft
- **Mitigation:** Delegated to identity provider; `Cache-Control: private` on auth endpoints

---

## Remaining Risks
> Document known risks that are accepted or mitigated differently here.
