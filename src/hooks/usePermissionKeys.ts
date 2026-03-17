'use client';

/**
 * usePermissionKeys — hook for checking feature flag keys from the permissions API.
 *
 * In this scaffold, the /api/permissions/flags endpoint returns boolean enabled/disabled
 * values based on Postgres overrides. The `isKeyEnabled` helper is provided for
 * compatibility if you later connect an external permissions system that returns
 * structured key objects.
 *
 * For most use cases, prefer the simpler `useFeatureFlag` or `useFeatureFlags` hooks.
 */

import { useEffect, useMemo, useReducer, useRef } from 'react';

const STALE_WHILE_REVALIDATE_MS = 30_000;

type PermissionKey = {
  Key: string;
  HideOnValue: string;
  Priority: number;
  [key: string]: unknown;
};

type PermissionKeysState = {
  keys: PermissionKey[];
  loading: boolean;
};

type KeysAction =
  | { type: 'loading' }
  | { type: 'resolved'; keys: PermissionKey[] }
  | { type: 'error' };

function reducer(state: PermissionKeysState, action: KeysAction): PermissionKeysState {
  switch (action.type) {
    case 'loading':
      return state.loading ? state : { ...state, loading: true };
    case 'resolved':
      return { keys: action.keys, loading: false };
    case 'error':
      return { keys: [], loading: false };
  }
}

/**
 * Fetch permission keys for the current user, optionally filtered by group IDs.
 * Uses stale-while-revalidate for zero-flicker updates.
 *
 * @param groupIds - Optional array of group IDs to filter by
 */
export function usePermissionKeys(
  groupIds?: string[],
): PermissionKeysState & { isKeyEnabled: (key: string) => boolean } {
  const [state, dispatch] = useReducer(reducer, { keys: [], loading: true });
  const lastFetchedAt = useRef(0);
  const groupIdsKey = groupIds?.sort().join(',') ?? '';

  useEffect(() => {
    let cancelled = false;

    async function fetchKeys() {
      try {
        const params = groupIdsKey ? `?groupIds=${encodeURIComponent(groupIdsKey)}` : '';
        const res = await fetch(`/api/permissions/flags${params}`);
        if (!res.ok) {
          if (!cancelled) dispatch({ type: 'error' });
          return;
        }
        const json = await res.json();
        if (!cancelled && json.success) {
          dispatch({ type: 'resolved', keys: json.data.keys ?? [] });
          lastFetchedAt.current = Date.now();
        }
      } catch {
        if (!cancelled) dispatch({ type: 'error' });
      }
    }

    const isStale = Date.now() - lastFetchedAt.current >= STALE_WHILE_REVALIDATE_MS;
    if (isStale) {
      dispatch({ type: 'loading' });
    }
    fetchKeys();

    return () => {
      cancelled = true;
    };
  }, [groupIdsKey]);

  /**
   * Check if a specific key is enabled within the loaded keys.
   * Returns true if the key is absent (not gated) or if HideOnValue !== "1".
   */
  const isKeyEnabled = useMemo(
    () =>
      (key: string): boolean => {
        const matches = state.keys.filter((k) => k.Key === key);
        if (matches.length === 0) return true; // Not gated
        const sorted = [...matches].sort((a, b) => a.Priority - b.Priority);
        return sorted[0]!.HideOnValue !== '1';
      },
    [state.keys],
  );

  return { ...state, isKeyEnabled };
}
