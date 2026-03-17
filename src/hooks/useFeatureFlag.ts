'use client';

import { useEffect, useReducer, useRef } from 'react';

const STALE_WHILE_REVALIDATE_MS = 30_000; // 30s

type FlagState = {
  enabled: boolean;
  loading: boolean;
};

type FlagAction = { type: 'loading' } | { type: 'resolved'; enabled: boolean };

function reducer(state: FlagState, action: FlagAction): FlagState {
  switch (action.type) {
    case 'loading':
      return state.loading ? state : { ...state, loading: true };
    case 'resolved':
      return { enabled: action.enabled, loading: false };
  }
}

/**
 * Check if a single feature flag is enabled for the current user.
 * Uses stale-while-revalidate: returns cached value immediately,
 * refreshes in the background.
 *
 * @param key          - The flag key to check (e.g. "module:feature-a")
 * @param defaultValue - Value to use while loading (default: true = fail-open)
 */
export function useFeatureFlag(key: string | null, defaultValue = true): FlagState {
  const [state, dispatch] = useReducer(reducer, { enabled: defaultValue, loading: !!key });
  const lastFetchedAt = useRef(0);

  useEffect(() => {
    if (!key) return;

    let cancelled = false;
    const isStale = Date.now() - lastFetchedAt.current >= STALE_WHILE_REVALIDATE_MS;

    async function check() {
      try {
        const res = await fetch(`/api/permissions/flags?key=${encodeURIComponent(key!)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.success) {
          dispatch({ type: 'resolved', enabled: json.data.enabled });
          lastFetchedAt.current = Date.now();
        }
      } catch {
        // Fail-open on error — keep current state
      }
    }

    if (isStale) {
      dispatch({ type: 'loading' });
    }
    check();

    return () => {
      cancelled = true;
    };
  }, [key, defaultValue]);

  return state;
}
