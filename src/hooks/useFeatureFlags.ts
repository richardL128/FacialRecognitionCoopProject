'use client';

import { useEffect, useReducer, useRef } from 'react';

const STALE_WHILE_REVALIDATE_MS = 30_000;

type FlagsState = {
  flags: Record<string, boolean>;
  loading: boolean;
};

type FlagsAction = { type: 'loading' } | { type: 'resolved'; flags: Record<string, boolean> };

function reducer(state: FlagsState, action: FlagsAction): FlagsState {
  switch (action.type) {
    case 'loading':
      return state.loading ? state : { ...state, loading: true };
    case 'resolved':
      return { flags: action.flags, loading: false };
  }
}

/**
 * Check multiple feature flags in a single request.
 * Returns a map of key → enabled and a loading state.
 *
 * Usage:
 *   const { flags, loading } = useFeatureFlags(['module:feature-a', 'ai:enabled']);
 *   if (flags['module:feature-a']) { ... }
 */
export function useFeatureFlags(keys: string[]): FlagsState {
  const stableKeys = keys.join(',');
  const defaults = Object.fromEntries(keys.map((k) => [k, true])); // fail-open
  const [state, dispatch] = useReducer(reducer, { flags: defaults, loading: keys.length > 0 });
  const lastFetchedAt = useRef(0);

  useEffect(() => {
    if (keys.length === 0) return;

    let cancelled = false;
    const isStale = Date.now() - lastFetchedAt.current >= STALE_WHILE_REVALIDATE_MS;

    async function check() {
      try {
        const params = new URLSearchParams();
        keys.forEach((k) => params.append('key', k));
        const res = await fetch(`/api/permissions/flags?${params.toString()}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.success) {
          dispatch({ type: 'resolved', flags: json.data.flags });
          lastFetchedAt.current = Date.now();
        }
      } catch {
        // Fail-open on error — keep defaults
      }
    }

    if (isStale) {
      dispatch({ type: 'loading' });
    }
    check();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKeys]);

  return state;
}
