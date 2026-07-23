import { createContext, useContext, useState, useCallback } from 'react';
import { decodeJwt } from '../lib/jwt';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Deliberately in-memory only (state, not localStorage) - a refresh logs the
  // analyst out. Trades convenience for not persisting a bearer token to disk,
  // where an XSS payload could read it long after the page that leaked it closed.
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);

  const login = useCallback((newToken) => {
    setToken(newToken);
    setUser(decodeJwt(newToken));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
