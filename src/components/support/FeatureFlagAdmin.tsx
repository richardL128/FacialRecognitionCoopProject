'use client';

import { useReducer, useEffect, useCallback } from 'react';
import { Switch } from '@progress/kendo-react-inputs';
import { DropDownList } from '@progress/kendo-react-dropdowns';
import { SvgIcon } from '@progress/kendo-react-common';
import { trashIcon, arrowRotateCwIcon } from '@progress/kendo-svg-icons';
import type { FeatureFlagMeta, FlagCategory } from '@/constants/featureFlagCatalog';

/* ── Types ─────────────────────────────────────────────────────────────── */

type Override = {
  id: string;
  flagKey: string;
  scope: 'GLOBAL' | 'TENANT' | 'CLIENT' | 'USER';
  tenantId: string | null;
  scopeId: string | null;
  enabled: boolean;
  reason: string | null;
  setBy: string;
  createdAt: string;
  updatedAt: string;
};

type Tenant = {
  id: string;
  name: string;
  slug: string;
};

type FlagRow = {
  meta: FeatureFlagMeta;
  globalOverride: Override | null;
  tenantOverrides: Override[];
};

/* ── State ─────────────────────────────────────────────────────────────── */

type State = {
  catalog: FeatureFlagMeta[];
  overrides: Override[];
  tenants: Tenant[];
  loading: boolean;
  saving: string | null;
  error: string | null;
  selectedTenantId: string | null;
  selectedCategory: FlagCategory | 'all';
};

type Action =
  | { type: 'loaded'; catalog: FeatureFlagMeta[]; overrides: Override[]; tenants: Tenant[] }
  | { type: 'error'; message: string }
  | { type: 'saving'; key: string }
  | { type: 'saved'; overrides: Override[] }
  | { type: 'select-tenant'; tenantId: string | null }
  | { type: 'select-category'; category: FlagCategory | 'all' }
  | { type: 'refresh' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return {
        ...state,
        catalog: action.catalog,
        overrides: action.overrides,
        tenants: action.tenants,
        loading: false,
        error: null,
      };
    case 'error':
      return { ...state, loading: false, saving: null, error: action.message };
    case 'saving':
      return { ...state, saving: action.key };
    case 'saved':
      return { ...state, overrides: action.overrides, saving: null, error: null };
    case 'select-tenant':
      return { ...state, selectedTenantId: action.tenantId };
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

/* ── Component ─────────────────────────────────────────────────────────── */

export default function FeatureFlagAdmin() {
  const [state, dispatch] = useReducer(reducer, {
    catalog: [],
    overrides: [],
    tenants: [],
    loading: true,
    saving: null,
    error: null,
    selectedTenantId: null,
    selectedCategory: 'all',
  });

  const loadData = useCallback(async () => {
    dispatch({ type: 'refresh' });
    try {
      const res = await fetch('/api/support/feature-flags');
      if (!res.ok) throw new Error('Failed to load feature flags');
      const json = await res.json();
      if (json.success) {
        dispatch({
          type: 'loaded',
          catalog: json.data.catalog,
          overrides: json.data.overrides,
          tenants: json.data.tenants,
        });
      }
    } catch (err) {
      dispatch({ type: 'error', message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function toggleFlag(
    flagKey: string,
    scope: 'GLOBAL' | 'TENANT',
    tenantId: string | null,
    enabled: boolean,
  ) {
    dispatch({ type: 'saving', key: `${flagKey}:${scope}:${tenantId}` });
    try {
      const res = await fetch('/api/support/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flagKey, scope, tenantId, enabled }),
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
      const res = await fetch(`/api/support/feature-flags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await loadData();
    } catch (err) {
      dispatch({ type: 'error', message: (err as Error).message });
    }
  }

  const allRows: FlagRow[] = state.catalog.map((flag) => {
    const globalOverride =
      state.overrides.find((o) => o.flagKey === flag.key && o.scope === 'GLOBAL') ?? null;
    const tenantOverrides = state.overrides.filter(
      (o) => o.flagKey === flag.key && o.scope === 'TENANT',
    );
    return { meta: flag, globalOverride, tenantOverrides };
  });

  const rows =
    state.selectedCategory === 'all'
      ? allRows
      : allRows.filter((r) => r.meta.category === state.selectedCategory);

  const categories: (FlagCategory | 'all')[] = [
    'all',
    ...new Set(state.catalog.map((f) => f.category)),
  ];

  const selectedTenant = state.tenants.find((t) => t.id === state.selectedTenantId) ?? null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="pe-h2" style={{ color: 'rgb(var(--pe-grey-100))' }}>
            Feature Flags
          </h1>
          <p className="pe-small mt-1" style={{ color: 'rgb(var(--pe-grey-50))' }}>
            Manage feature availability across the platform. Global overrides affect all tenants.
            Tenant-level overrides take effect when no global override exists.
          </p>
          <p className="pe-small mt-0.5" style={{ color: 'rgb(var(--pe-grey-40))' }}>
            {state.catalog.length} flags across{' '}
            {new Set(state.catalog.map((f) => f.category)).size} categories
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          disabled={state.loading}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
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
            Tenant:
          </label>
          <DropDownList
            data={[{ id: null, name: 'All tenants (global view)' }, ...state.tenants]}
            textField="name"
            dataItemKey="id"
            value={selectedTenant ?? { id: null, name: 'All tenants (global view)' }}
            onChange={(e) => dispatch({ type: 'select-tenant', tenantId: e.value?.id ?? null })}
            style={{ width: 300 }}
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
      </div>

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
              {['Category', 'Feature', 'Description', 'Scopes / Personas', 'Global', ...(state.selectedTenantId ? [selectedTenant?.name ?? 'Tenant'] : []), 'Overrides'].map((h) => (
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
            {rows.map((row) => {
              const tenantOverride = row.tenantOverrides.find(
                (o) => o.tenantId === state.selectedTenantId,
              );
              const globalDisabled = row.globalOverride?.enabled === false;

              return (
                <tr
                  key={row.meta.key}
                  className="transition-colors hover:bg-[rgb(var(--pe-grey-5)/0.5)]"
                  style={{ borderBottom: '1px solid rgb(var(--pe-grey-10))' }}
                >
                  <td className="px-4 py-3">
                    <CategoryBadge category={row.meta.category} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="pe-body font-medium" style={{ color: 'rgb(var(--pe-grey-100))' }}>
                      {row.meta.label}
                    </div>
                    <div className="pe-small font-mono" style={{ color: 'rgb(var(--pe-grey-50))' }}>
                      {row.meta.key}
                    </div>
                    {row.meta.dependsOn && (
                      <div className="pe-small" style={{ color: 'rgb(var(--pe-grey-40))' }}>
                        depends on: {row.meta.dependsOn}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="pe-small" style={{ color: 'rgb(var(--pe-grey-60))' }}>
                      {row.meta.description}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {row.meta.allowedScopes.map((s) => (
                        <span
                          key={s}
                          className="rounded bg-[rgb(var(--pe-grey-10))] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[rgb(var(--pe-grey-60))]"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.meta.personas.map((p) => (
                        <span key={p} className="text-[10px] text-[rgb(var(--pe-grey-40))]">
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={row.globalOverride?.enabled ?? true}
                        disabled={state.saving === `${row.meta.key}:GLOBAL:null`}
                        onChange={(e) => toggleFlag(row.meta.key, 'GLOBAL', null, e.value)}
                      />
                      {row.globalOverride && (
                        <button
                          type="button"
                          onClick={() => deleteOverride(row.globalOverride!.id)}
                          className="rounded p-1 text-[rgb(var(--pe-grey-40))] transition hover:text-red-600"
                          title="Remove global override"
                        >
                          <SvgIcon icon={trashIcon} size="small" />
                        </button>
                      )}
                    </div>
                    {!row.globalOverride && (
                      <span className="pe-small text-[rgb(var(--pe-grey-40))]">No override</span>
                    )}
                  </td>
                  {state.selectedTenantId && (
                    <td className="px-4 py-3">
                      {globalDisabled ? (
                        <span className="pe-small text-red-600">Blocked by global</span>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={tenantOverride?.enabled ?? true}
                              disabled={
                                state.saving === `${row.meta.key}:TENANT:${state.selectedTenantId}`
                              }
                              onChange={(e) =>
                                toggleFlag(row.meta.key, 'TENANT', state.selectedTenantId, e.value)
                              }
                            />
                            {tenantOverride && (
                              <button
                                type="button"
                                onClick={() => deleteOverride(tenantOverride.id)}
                                className="rounded p-1 text-[rgb(var(--pe-grey-40))] transition hover:text-red-600"
                                title="Remove tenant override"
                              >
                                <SvgIcon icon={trashIcon} size="small" />
                              </button>
                            )}
                          </div>
                          {!tenantOverride && (
                            <span className="pe-small text-[rgb(var(--pe-grey-40))]">No override</span>
                          )}
                        </>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className="pe-small" style={{ color: 'rgb(var(--pe-grey-60))' }}>
                      {row.tenantOverrides.length > 0
                        ? `${row.tenantOverrides.length} tenant${row.tenantOverrides.length > 1 ? 's' : ''}`
                        : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {state.loading && rows.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <span className="pe-body" style={{ color: 'rgb(var(--pe-grey-50))' }}>
              Loading feature flags…
            </span>
          </div>
        )}
      </div>

      <div
        className="mt-4 flex items-start gap-6 text-xs"
        style={{ color: 'rgb(var(--pe-grey-50))' }}
      >
        <div>Toggle a switch to create an override. The override takes precedence over the default.</div>
        <div className="flex items-center gap-1.5">
          <SvgIcon icon={trashIcon} size="small" />
          <span>Delete an override to revert to the default behaviour.</span>
        </div>
      </div>
    </div>
  );
}
