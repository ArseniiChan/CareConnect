// AuthContext — central place for the current user and login/logout actions.
// JWT-in-localStorage strategy: see docs/interview-prep/adr-001-jwt-localstorage.md

import { createContext, useContext, useEffect, useState } from 'react';
import { auth as authApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, try to rehydrate from localStorage.
  // If the token is present, ask /auth/me to confirm it's still valid.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    authApi.me()
      .then((res) => {
        // /auth/me returns { status, data: { user_id, email, role, profile, ... } }
        // We hydrate from data; if profile has names, surface them.
        const me = res.data || {};
        setUser({
          id: me.user_id,
          email: me.email,
          role: me.role,
          firstName: me.profile?.first_name || null,
          lastName: me.profile?.last_name || null,
        });
      })
      .catch(() => {
        // Token is bad or expired — clear it.
        localStorage.removeItem('token');
        localStorage.removeItem('refresh');
        localStorage.removeItem('user');
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await authApi.login(email, password);
    // /auth/login returns { status, message, user, accessToken, refreshToken }
    localStorage.setItem('token', res.accessToken);
    localStorage.setItem('refresh', res.refreshToken);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  }

  async function register(data) {
    const res = await authApi.register(data);
    localStorage.setItem('token', res.accessToken);
    localStorage.setItem('refresh', res.refreshToken);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    setUser(null);
  }

  const value = { user, loading, login, register, logout };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
