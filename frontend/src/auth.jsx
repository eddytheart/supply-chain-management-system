import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';

export const ROLES = {
  REQUESTER: 'Requester',
  STORE: 'Store Officer',
  PROCUREMENT: 'Procurement Officer',
  ADMIN: 'Administrator',
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // On first load, restore the session if a token is saved.
  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    window.addEventListener('scm-unauthorized', logout);
    return () => window.removeEventListener('scm-unauthorized', logout);
  }, [logout]);

  const login = async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
