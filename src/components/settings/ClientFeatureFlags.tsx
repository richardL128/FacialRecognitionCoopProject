'use client';

import { useReducer, useEffect, useCallback } from 'react';
import { Switch } from '@progress/kendo-react-inputs';
import { DropDownList } from '@progress/kendo-react-dropdowns';
import { SvgIcon } from '@progress/kendo-react-common';
import { trashIcon, arrowRotateCwIcon, lockIcon } from '@progress/kendo-svg-icons';
import type { FeatureFlagMeta, FlagCategory } from '@/constants/featureFlagCatalog';

/* ── Types ─────────────────────────────────────────────────────────────── */

type Override = {
  id: string;
  flagKey: string;
  scope: string;
  tenantId: string | null;
  scopeId: string | null;
  enabled: boolean;
  reason: string | null;
  setBy: string;
  createdAt: string;
  updatedAt: string;
};

type TenantOverride = {
  flagKey: string;
  enabled: boolean;
};

type GlobalOverride = {
  flagKey: string;
  enabled: boolean;
};

/**
 * Generic "client" entity — replace this with whatever sub-tenant resource
 * your application allows per-entity feature flag overrides for
 * (e.g. "team", "group", "project", "location", etc.).
 */
type ClientEntity = {
  id: string;
  name: string;
};

/* ── State ─────────────────────────────────────────────────────────────── */

type State = {
  catalog: FeatureFlagMeta[];
  overrides: Override[];
  tenantOverrides: TenantOverride[];
  globalOverrides: GlobalOverride[];
  clients: ClientEntity[];
  selectedClientId: string | null;
  selectedCategory: FlagCategory | 'all';
  loading: boolean;
  saving: string | null;
  error: string | null;
};

type Action =
  | {
      type: 'loaded';
      catalog: FeatureFlagMeta[];
      overrides: Override[];
      tenantOverrides: TenantOverride[];
      globalOverrides: GlobalOverride[];
      clients: ClientEntity[];
    }
  | { type: 'error'; message: string }
  | { type: 'saving'; key: string }
  | { type: 'saved'; overrides: Override[] }
  | { type: 'select-client'; clientId: string | null }
  | { type: 'select-category'; category: FlagCategory | 'all' }
  | { type: 'refresh' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        catalog: action.catalog,
        overrides: action.overrides,
        tenantOverrides: action.tenantOverrides,
        globalOverrides: action.globalOverrides,
        clients: action.clients,
        loading: false,
        error: null,
      };
    case 'error':
      return { ...state, loading: false, saving: null, error: action.message };
    case 'saving':
      return { ...state, saving: action.key };
    case 'saved':
      return { ...state, overrides: action.overrides, saving: null, error: null };
    case 'select-client':
      return { ...state, selectedClientId: action.clientId };
    case 'select-category':
      return { ...state, selectedCategory: action.category };
    case 'refresh':
      return { ...state, loading: true };
  }
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, string> = {
  module: 'rgb(var(--pe-blue-80))',
  tool: '#0891b2',
  capability: '#16a34a',
  ai: '#9333ea',
  billing: '#ea580c',
  compliance: '#dc2626',
  integration: '#4f46e5',
};

function CategoryBadge({ category }: { category: string }) {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ background: CATEGORY_COLORS[category] ?? 'rgb(var(--pe-grey-60))' }}
    >
      {category}
    </span>
  );
}

function BlockedBadge({ reason }: { reason: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
      <SvgIcon icon={lockIcon} size="small" />
      {reason}
    </span>
  );
}

/* ── Component ─────────────────────────────────────────────────────────── */

export default function ClientFeatureFlags() {
  const [state, dispatch] = useReducer(reducer, {
    catalog: [],
    overrides: [],
    tenantOverrides: [],
    globalOverrides: [],
    clients: [],
    selectedClientId: null,
    selectedCategory: 'all',
    loading: true,
    saving: null,
    error: null,
  });

  const loadData = useCallback(async () => {
    dispatch({ type: 'refresh' });
    try {
      const res = await fetch('/api/settings/feature-flags');
      if (!res.ok) throw new Error('Failed to load feature flags');
      const json = await res.json();
      if (json.success) {
        dispatch({
          type: 'loaded',
          catalog: json.data.catalog,
          overrides: json.data.overrides,
          tenantOverrides: json.data.tenantOverrides,
          globalOverrides: json.data.globalOverrides,
          clients: json.data.clients,
        });
      }
    } catch (err) {
      dispatch({ type: 'error', message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function getBlockedReason(flagKey: string): string | null {
    if (state.globalOverrides.some((o) => o.flagKey === flagKey && !o.enabled)) {
      return 'Disabled globally';
    }
    if (state.tenantOverrides.some((o) => o.flagKey === flagKey && !o.enabled)) {
      return 'Disabled by platform support';
    }
    return null;
  }

  async function toggleFlag(flagKey: string, clientId: string, enabled: boolean) {
    dispatch({ type: 'saving', key: `${flagKey}:${clientId}` });
    try {
      const res = await fetch('/api/settings/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagKey, clientId, enabled }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error?.message ?? 'Save failed');
      }
      await loadData();
    } catch (err) {
      dispatch({ type: 'error', message: (err as Error).message });
    }
  }

  async function deleteOverride(id: string) {
    try {
      const res = await fetch(`/api/settings/feature-flags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await loadData();
    } catch (err) {
      dispatch({ type: 'error', message: (err as Error).message });
    }
  }

  const filteredCatalog =
    state.selectedCategory === 'all'
      ? state.catalog
      : state.catalog.filter((f) => f.category === state.selectedCategory);

  const categories: (FlagCategory | 'all')[] = [
    'all',
    ...new Set(state.catalog.map((f) => f.category)),
  ];

  const selectedClient = state.clients.find((c) => c.id === state.selectedClientId) ?? null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
          Feature Management
        </h1>
        <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-50))' }}>
          Enable or disable features for individual entities. Features disabled at the platform or
          tenant level cannot be enabled here.
        </p>
      </div>

      {state.error && (
        <div
          className="mb-4 rounded-lg px-4 py-3 text-sm"
          style={{
            background: 'rgb(var(--pe-error-light, 254 226 226))',
            color: 'rgb(var(--pe-error, 220 38 38))',
            border: '1px solid rgb(var(--pe-error, 220 38 38) / 0.2)',
          }}
        >
          {state.error}
        </div>
      )}

      <div className="mb-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="pe-small font-medium" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Entity:
          </label>
          <DropDownList
            data={state.clients}
            textField="name"
            dataItemKey="id"
            value={selectedClient}
            onChange={(e) => dispatch({ type: 'select-client', clientId: e.value?.id ?? null })}
            style={{ width: 280 }}
            defaultItem={{ id: null, name: '— Select an entity —' }}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="pe-small font-medium" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Category:
          </label>
          <DropDownList
            data={categories}
            value={state.selectedCategory}
            onChange={(e) => dispatch({ type: 'select-category', category: e.value })}
            style={{ width: 160 }}
          />
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={state.loading}
          className="ml-auto flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{
            background: 'rgb(var(--pe-primary))',
            border: '1px solid rgb(var(--pe-grey-20))',
            color: 'rgb(var(--pe-grey-70))',
          }}
        >
          <SvgIcon icon={arrowRotateCwIcon} size="small" />
          Refresh
        </button>
      </div>

      {!state.selectedClientId && !state.loading && (
        <div
          className="flex flex-col items-center justify-center rounded-lg p-12 text-center"
          style={{
            background: 'rgb(var(--pe-primary))',
            border: '1px solid rgb(var(--pe-grey-20))',
          }}
        >
          <p className="pe-body" style={{ color: 'rgb(var(--pe-grey-70))' }}>
            Select an entity to manage its feature flags.
          </p>
          <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-40))' }}>
            Each entity can have individual feature toggles within your tenant&#39;s allowed features.
          </p>
        </div>
      )}

      {state.selectedClientId && (
        <div
          className="overflow-hidden rounded-lg"
          style={{ border: '1px solid rgb(var(--pe-grey-20))' }}
        >
          <table className="w-full text-left">
            <thead>
              <tr
                style={{
                  background: 'rgb(var(--pe-grey-5))',
                  borderBottom: '1px solid rgb(var(--pe-grey-20))',
                }}
              >
                {['Category', 'Feature', 'Description', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'rgb(var(--pe-grey-60))' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCatalog.map((flag) => {
                const blockedReason = getBlockedReason(flag.key);
                const override = state.overrides.find(
                  (o) => o.flagKey === flag.key && o.scopeId === state.selectedClientId,
                );
                const isBlocked = blockedReason !== null;

                return (
                  <tr
                    key={flag.key}
                    className="transition-colors hover:bg-[rgb(var(--pe-grey-5)/0.5)]"
                    style={{
                      borderBottom: '1px solid rgb(var(--pe-grey-10))',
                      opacity: isBlocked ? 0.5 : 1,
                    }}
                  >
                    <td className="px-4 py-3">
                      <CategoryBadge category={flag.category} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="pe-body font-medium" style={{ color: 'rgb(var(--pe-grey-100))' }}>
                        {flag.label}
                      </div>
                      <div className="pe-small font-mono" style={{ color: 'rgb(var(--pe-grey-50))' }}>
                        {flag.key}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="pe-small" style={{ color: 'rgb(var(--pe-grey-60))' }}>
                        {flag.description}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isBlocked ? (
                        <BlockedBadge reason={blockedReason} />
                      ) : (
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={override?.enabled ?? true}
                            disabled={state.saving === `${flag.key}:${state.selectedClientId}`}
                            onChange={(e) => toggleFlag(flag.key, state.selectedClientId!, e.value)}
                          />
                          {!override && (
                            <span className="pe-small text-[rgb(var(--pe-grey-40))]">Default</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {override && !isBlocked && (
                        <button
                          type="button"
                          onClick={() => deleteOverride(override.id)}
                          className="rounded p-1 text-[rgb(var(--pe-grey-40))] transition hover:text-red-600"
                          title="Remove override (revert to default)"
                        >
                          <SvgIcon icon={trashIcon} size="small" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {state.loading && filteredCatalog.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <span className="pe-body" style={{ color: 'rgb(var(--pe-grey-50))' }}>Loading…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
