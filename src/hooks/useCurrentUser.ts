'use client';

import { useEffect, useReducer, useRef } from 'react';

type CurrentUser = {
  userId: string;
  role: string;
  email: string;
  tenantId: string;
};

type State = {
  user: CurrentUser | null;
  loading: boolean;
};

type Action = { type: 'resolved'; user: CurrentUser } | { type: 'error' };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case 'resolved':
      return { user: action.user, loading: false };
    case 'error':
      return { user: null, loading: false };
  }
}

/**
 * Returns the current authenticated user's basic info (role, email, tenantId).
 * Fetches /api/auth/me once per page load; cached for 60s via Cache-Control.
 */
export function useCurrentUser(): State {
  const [state, dispatch] = useReducer(reducer, { user: null, loading: true });
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success) {
          dispatch({ type: 'resolved', user: json.data });
        } else {
          dispatch({ type: 'error' });
        }
      })
      .catch(() => dispatch({ type: 'error' }));
  }, []);

  return state;
}
