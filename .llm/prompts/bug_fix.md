# Prompt Template: Bug Fix

Use this prompt when asking an LLM to help diagnose and fix a bug.

---

**Context** (paste at start of conversation):
```
Project: [Your Project Name]
Docs to follow:
- .llm/ARCHITECTURE.md (for understanding where code lives)
- .llm/CONVENTIONS.md (for correct patterns)
```

**Bug Report**:
```
Description: [what is happening]
Expected: [what should happen]
Steps to reproduce:
  1. [step]
  2. [step]

Error message / stack trace:
[paste here]

Affected file(s): [if known]
```

**Ask**:
```
Please:
1. Identify the root cause
2. Propose a fix that follows CONVENTIONS.md patterns
3. Identify any related code that may have the same issue
4. Confirm no audit logging gaps are introduced by the fix
```
