# Data Classification

> Fill in this file with your project's actual data categories before handling production data.

## Classification Levels

| Level | Definition | Examples |
|-------|-----------|---------|
| **Public** | Safe to share openly | Documentation, marketing copy |
| **Internal** | Not for external distribution | Internal metrics, configuration |
| **Confidential** | Restricted — need-to-know basis | User data, business data |
| **Restricted** | Highest sensitivity — strictly controlled | PII, credentials, encryption keys |

---

## Data Inventory

> List your application's data and classify each field.

### Users
| Field | Classification | Storage | Notes |
|-------|--------------|---------|-------|
| `id` | Internal | Database (plaintext) | UUID |
| `email` | Confidential | Database (plaintext) | |
| `role` | Internal | Database (plaintext) | |
| `tenantId` | Internal | Database (plaintext) | |

### Tenants
| Field | Classification | Storage | Notes |
|-------|--------------|---------|-------|
| `name` | Internal | Database (plaintext) | |
| `slug` | Internal | Database (plaintext) | |

### [Your Entities]
> Add your domain entities here and classify their fields.

---

## Handling Rules by Classification

| Level | Logging | URLs | Client-side | Encryption at rest |
|-------|---------|------|-------------|-------------------|
| Public | OK | OK | OK | Not required |
| Internal | OK | OK | OK with care | Optional |
| Confidential | Masked | No | No | Recommended |
| Restricted | Never | Never | Never | Required |

---

## PII Redaction
The Pino logger (`src/lib/logger.ts`) automatically redacts fields matching:
`password`, `token`, `secret`

Add any additional sensitive fields to the `redact.paths` array in `src/lib/logger.ts`.
