import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { login as loginRequest, loginTwoFactor } from '../services/api/auth.api';

export const useAuth = () => {
  const { user, token, login, logout, notify } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingTwoFactorUserId, setPendingTwoFactorUserId] = useState<string | null>(null);

  const authenticate = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      const result = await loginRequest({ email, password });
      if (result.twoFactorRequired) {
        setPendingTwoFactorUserId(result.userId);
        return null;
      }
      setPendingTwoFactorUserId(null);
      login(result.user, result.token);
      notify('Connexion réussie');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connexion impossible';
      setError(message);
      notify(message, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const completeTwoFactor = async (code: string) => {
    if (!pendingTwoFactorUserId) return null;
    try {
      setLoading(true);
      setError(null);
      const result = await loginTwoFactor(pendingTwoFactorUserId, code);
      login(result.user, result.token);
      setPendingTwoFactorUserId(null);
      notify('Connexion réussie');
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Code invalide';
      setError(message);
      notify(message, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const cancelTwoFactor = () => {
    setPendingTwoFactorUserId(null);
    setError(null);
  };

  return {
    user,
    token,
    loading,
    error,
    login: authenticate,
    logout,
    pendingTwoFactorUserId,
    completeTwoFactor,
    cancelTwoFactor,
  };
};
