# Skill: Feature Flags

## Overview
The scaffold includes a 3-tier feature flag system:
- **GLOBAL** — applies to all tenants (platform admin only)
- **TENANT** — applies to a specific tenant (platform admin)
- **CLIENT** — applies to a specific client within a tenant (tenant admin)

## Flag Catalog
Define all flags in `src/constants/featureFlagCatalog.ts`.
Each flag has:
- `key` — the flag identifier (e.g. `'module:feature-name'`)
- `label` — human-readable name
- `description` — what the flag controls
- `category` — one of: `module`, `capability`, `ai`, `integration`, `killswitch`
- `allowedScopes` — which tiers this flag can be set at
- `personas` — which user types interact with this flag

## Usage in Client Components
```tsx
'use client';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

function MyComponent() {
  const isEnabled = useFeatureFlag('module:my-feature');
  if (!isEnabled) return null;
  return <div>Feature content</div>;
}
```

## Usage in Server Components / API Routes
```typescript
import { featureFlags } from '@/lib/feature-flags';

const isEnabled = await featureFlags.isEnabled('module:my-feature', {
  tenantId: session.tenantId,
});
```

## Gate Component
```tsx
import FeatureGate from '@/components/ui/FeatureGate';

<FeatureGate flag="module:my-feature">
  <MyComponent />
</FeatureGate>
```

## Kill Switches
For emergency disable without a code deploy, use env-var kill switches
configured in `src/middleware.ts`:
```
KILL_SWITCH_FEATURE_A=true   # disables /feature-a route instantly
```

## Adding a New Flag
1. Add to `src/constants/featureFlagCatalog.ts`
2. Use `featureFlags.isEnabled()` in API routes
3. Use `useFeatureFlag()` or `<FeatureGate>` in UI
4. Add a kill switch in middleware if the feature needs instant-off capability
