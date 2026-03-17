/**
 * Feature flag catalog — the authoritative list of all feature flags in the system.
 *
 * Convention: `module:<name>` for top-level modules, `tool:<name>` for tools,
 *             `cap:<name>` for capabilities, `ai:<name>` for AI features,
 *             `billing:<name>` for billing, `integration:<name>` for integrations.
 *
 * Scoping:
 *   - GLOBAL: Platform Support can enable/disable for the entire platform
 *   - TENANT: Platform Support can enable/disable per tenant
 *   - CLIENT: Tenant Admin can enable/disable per client/sub-entity
 *             (only if TENANT-level is enabled)
 *
 * When building a new feature, add its flag here and gate it using:
 *   Server:  featureFlags.isEnabled('module:feature-a', ctx)
 *   Client:  <FeatureGate flagKey="module:feature-a">...</FeatureGate>
 *   API:     withApi(handler, { featureFlag: 'module:feature-a' })
 *   Page:    withPageGate('module:feature-a')(PageComponent)
 */

export type FlagCategory =
  | 'module'       // Top-level navigation modules
  | 'tool'         // Standalone tools and assistants
  | 'capability'   // Cross-cutting capabilities within modules
  | 'ai'           // AI-powered features
  | 'billing'      // Billing, payments, package limits
  | 'compliance'   // Compliance and regulatory features
  | 'integration'; // Third-party integrations

export type FlagScope = 'global' | 'tenant' | 'client';

export type FlagPersona = 'admin' | 'manager' | 'user' | 'viewer';

export type FeatureFlagMeta = {
  /** Unique key (e.g. "module:feature-a"). Used in code and DB. */
  key: string;
  /** Human-readable label for the admin UI */
  label: string;
  /** One-line description */
  description: string;
  /** Grouping category */
  category: FlagCategory;
  /** Which scopes this flag can be overridden at */
  allowedScopes: FlagScope[];
  /** Which personas see this feature when enabled */
  personas: FlagPersona[];
  /** If set, this flag depends on another flag being enabled first */
  dependsOn?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
//  CATALOG — Replace these with your actual feature flags
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURE_FLAG_CATALOG: FeatureFlagMeta[] = [
  // ═══ MODULES ══════════════════════════════════════════════════════════════
  // Top-level navigation sections. Disabling hides the nav link and returns
  // 404 from all API routes under that module.

  {
    key: 'module:dashboard',
    label: 'Dashboard',
    description: 'Main dashboard with tiles and quick actions',
    category: 'module',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin', 'manager', 'user', 'viewer'],
  },
  {
    key: 'module:feature-a',
    label: 'Feature A',
    description: 'Placeholder — replace with your first feature module',
    category: 'module',
    allowedScopes: ['global', 'tenant', 'client'],
    personas: ['admin', 'manager', 'user'],
  },
  {
    key: 'module:feature-b',
    label: 'Feature B',
    description: 'Placeholder — replace with your second feature module',
    category: 'module',
    allowedScopes: ['global', 'tenant', 'client'],
    personas: ['admin', 'manager'],
  },
  {
    key: 'module:settings',
    label: 'Settings',
    description: 'Tenant configuration, user management, preferences',
    category: 'module',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin'],
  },

  // ═══ CAPABILITIES ═════════════════════════════════════════════════════════
  // Cross-cutting product capabilities.

  {
    key: 'cap:bulk-import',
    label: 'Bulk Import',
    description: 'CSV/Excel bulk import for entity data',
    category: 'capability',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin', 'manager'],
  },
  {
    key: 'cap:excel-export',
    label: 'Excel Export',
    description: 'KendoReact Grid export to Excel across data tables',
    category: 'capability',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin', 'manager', 'user'],
  },
  {
    key: 'cap:document-upload',
    label: 'Document Upload',
    description: 'File attachments on records',
    category: 'capability',
    allowedScopes: ['global', 'tenant', 'client'],
    personas: ['admin', 'manager', 'user'],
  },
  {
    key: 'cap:sso-federation',
    label: 'Enterprise SSO',
    description: 'SAML 2.0 / OIDC federation (Azure AD, Okta, Google Workspace)',
    category: 'capability',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin'],
  },
  {
    key: 'cap:webhooks',
    label: 'Webhooks',
    description: 'Outbound event notifications for entity changes',
    category: 'capability',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin'],
  },
  {
    key: 'cap:custom-fields',
    label: 'Custom Fields',
    description: 'User-defined fields on entity records',
    category: 'capability',
    allowedScopes: ['global', 'tenant', 'client'],
    personas: ['admin', 'manager'],
  },

  // ═══ AI ════════════════════════════════════════════════════════════════════

  {
    key: 'ai:enabled',
    label: 'AI Features (Master)',
    description: 'Master toggle: enables all AI-powered features',
    category: 'ai',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin', 'manager', 'user'],
  },
  {
    key: 'ai:document-parser',
    label: 'AI Document Parser',
    description: 'AI-powered extraction from uploaded documents',
    category: 'ai',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin', 'manager'],
    dependsOn: 'ai:enabled',
  },
  {
    key: 'ai:suggestions',
    label: 'AI Suggestions',
    description: 'Contextual AI suggestions and auto-complete within the app',
    category: 'ai',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin', 'manager', 'user'],
    dependsOn: 'ai:enabled',
  },

  // ═══ BILLING ══════════════════════════════════════════════════════════════

  {
    key: 'billing:stripe-payments',
    label: 'Stripe Payments',
    description: 'Enable Stripe as a payment method',
    category: 'billing',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin'],
  },

  // ═══ COMPLIANCE ═══════════════════════════════════════════════════════════

  {
    key: 'compliance:audit-export',
    label: 'Audit Export',
    description: 'Exportable audit trail for regulatory compliance',
    category: 'compliance',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin'],
  },
  {
    key: 'compliance:data-retention',
    label: 'Data Retention Policies',
    description: 'Configurable data retention periods',
    category: 'compliance',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin'],
  },

  // ═══ INTEGRATIONS ═════════════════════════════════════════════════════════

  {
    key: 'integration:xero-sync',
    label: 'Xero Sync',
    description: 'Bi-directional sync with Xero',
    category: 'integration',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin'],
  },
  {
    key: 'integration:azure-ad',
    label: 'Azure AD SSO',
    description: 'Azure Active Directory single sign-on federation',
    category: 'integration',
    allowedScopes: ['global', 'tenant'],
    personas: ['admin'],
    dependsOn: 'cap:sso-federation',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  LOOKUP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Quick lookup by key */
export const FLAG_META_MAP = new Map(FEATURE_FLAG_CATALOG.map((f) => [f.key, f]));

/** Get all flags in a category */
export function flagsByCategory(category: FlagCategory): FeatureFlagMeta[] {
  return FEATURE_FLAG_CATALOG.filter((f) => f.category === category);
}

/** Get all flags relevant to a persona */
export function flagsByPersona(persona: FlagPersona): FeatureFlagMeta[] {
  return FEATURE_FLAG_CATALOG.filter((f) => f.personas.includes(persona));
}

/** Get all flags that allow a given scope */
export function flagsByScope(scope: FlagScope): FeatureFlagMeta[] {
  return FEATURE_FLAG_CATALOG.filter((f) => f.allowedScopes.includes(scope));
}

/** Get the dependency chain for a flag (returns keys in order) */
export function getFlagDependencyChain(key: string): string[] {
  const chain: string[] = [];
  let current = FLAG_META_MAP.get(key);
  while (current?.dependsOn) {
    chain.unshift(current.dependsOn);
    current = FLAG_META_MAP.get(current.dependsOn);
  }
  return chain;
}

/** All unique categories present in the catalog */
export const FLAG_CATEGORIES: FlagCategory[] = [
  ...new Set(FEATURE_FLAG_CATALOG.map((f) => f.category)),
];
