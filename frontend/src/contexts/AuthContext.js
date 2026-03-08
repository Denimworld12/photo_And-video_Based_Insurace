import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const token = localStorage.getItem('authToken');
      const data = localStorage.getItem('userData');
      if (token && data) {
        const parsed = JSON.parse(data);
        setUser(parsed);
        setIsAuthenticated(true);
      }
    } catch {
      localStorage.removeItem('authToken');
      localStorage.removeItem('userData');
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback((token, userData) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('userData', JSON.stringify(userData));
    setUser(userData);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const getToken = useCallback(() => localStorage.getItem('authToken'), []);

  const isAdmin = user?.role === 'admin';

  const updateUser = useCallback(
    (updatedData) => {
      const newUser = { ...user, ...updatedData };
      localStorage.setItem('userData', JSON.stringify(newUser));
      setUser(newUser);
    },
    [user]
  );

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, getToken, isAdmin, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
