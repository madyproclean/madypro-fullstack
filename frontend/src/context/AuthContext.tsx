import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '../types/user';
import { setUnauthorizedHandler } from '../services/api/client';

type Toast = {
  id: number;
  message: string;
  type?: 'success' | 'error' | 'info';
};

type AuthState = {
  user: User | null;
  token: string | null;
};

type AuthContextValue = AuthState & {
  login: (user: User, token: string) => void;
  logout: () => void;
  notify: (message: string, type?: 'success' | 'error' | 'info') => void;
  toasts: Toast[];
  removeToast: (id: number) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'madypro-auth';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window === 'undefined') {
      return { user: null, token: null };
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : { user: null, token: null };
    } catch (error) {
      console.error('Failed to read auth storage', error);
      return { user: null, token: null };
    }
  });

  const login = (user: User, token: string) => setState({ user, token });
  const logout = () => setState({ user: null, token: null });

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ user: null, token: null }));
    return () => setUnauthorizedHandler(null);
  }, []);

  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToasts((prev) => [...prev, { id: Date.now(), message, type }]);
  };
  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (state.user && state.token) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [state]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, notify, toasts, removeToast }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};
