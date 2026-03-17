# Domain Glossary

> **Scaffold note:** Replace these terms with the canonical terminology for your domain.
> Use these exact terms consistently in code, variables, comments, and UI labels.
> This file is the single source of truth — if a term isn't here, it shouldn't exist in the codebase.

## Core Entities
| Term | Meaning |
|------|---------|
| **Tenant** | One organisation. Top-level isolation unit. |
| **User** | A person with an account in the system |

> Add your domain entities here. Examples:
> | **Client** | A customer managed by a Tenant |
> | **Project** | A body of work belonging to a Client |

## Roles
| Term | Meaning |
|------|---------|
| **PLATFORM_ADMIN** | Internal platform administrator — full access |
| **ADMIN** | Organisation-level administrator |
| **MANAGER** | Team or functional manager |
| **USER** | Standard application user |
| **VIEWER** | Read-only access |

> Update these roles in `prisma/schema.prisma` and `src/lib/permissions/index.ts`
> to match your actual system.

## System Terms
| Term | Meaning |
|------|---------|
| **AuditEvent** | An immutable record of any action taken in the system |
| **TenantContext** | The resolved tenant for the current request |
| **FeatureFlag** | A toggle that enables/disables a feature globally, per tenant, or per client |
| **KillSwitch** | An environment-variable-based toggle for instant feature disable without deploy |

## Status Values
> Document your entity status enums here.
> e.g. DRAFT, ACTIVE, ARCHIVED, DELETED

## [Your Domain Terms Here]
| Term | Meaning |
|------|---------|
| **[Term]** | [Definition] |
