'use client';

import { useEffect, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';

export function useAuth() {
  const {
    user,
    token,
    isAuthenticated,
    login,
    loginWithPin,
    logout,
    setUser,
  } = useAuthStore();

  // Verify token on mount by calling /auth/me
  useEffect(() => {
    if (token && !user) {
      api
        .get('/auth/me')
        .then(({ data }) => {
          setUser(data.user, token);
        })
        .catch(() => {
          // Token invalid — clear state (401 interceptor handles redirect)
          useAuthStore.getState().logout();
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const logoutAndRedirect = useCallback(() => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }, [logout]);

  return {
    user,
    token,
    isAuthenticated,
    login,
    loginWithPin,
    logout: logoutAndRedirect,
    setUser,
  };
}
