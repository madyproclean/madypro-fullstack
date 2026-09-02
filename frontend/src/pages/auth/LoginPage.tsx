import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LogIn, Check, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAuthContext } from '../../context/AuthContext';
import { User } from '../../types/user';

const roleFallbackRoute = (role?: string) => {
  const upper = role?.toUpperCase();
  return upper === 'SUPERVISOR' ? '/supervision/dashboard' : '/dashboard';
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  const { user } = useAuthContext();
  const {
    login: authenticate,
    loading,
    error,
    pendingTwoFactorUserId,
    completeTwoFactor,
    cancelTwoFactor,
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const targetRoute = React.useMemo(() => from ?? roleFallbackRoute(user?.role), [from, user?.role]);

  const redirectAfterLogin = (loggedInUser: User) => {
    navigate(from ?? roleFallbackRoute(loggedInUser.role), { replace: true });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await authenticate(email, password);
    if (!result) return; // 2FA requise, on reste sur la page
    redirectAfterLogin(result.user);
  };

  const handleTwoFactorSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await completeTwoFactor(code);
    if (!result) return;
    redirectAfterLogin(result.user);
  };

  if (user) {
    return <Navigate to={targetRoute} replace />;
  }

  if (pendingTwoFactorUserId) {
    return (
      <div className="auth-page">
        <div className="auth-page__intro">
          <img src="/logo-full.png" alt="Madypro Clean" className="auth-page__logo" />
          <h1>Vérification en deux étapes</h1>
          <p>Saisissez le code à 6 chiffres généré par votre application d’authentification.</p>
        </div>

        <form className="form-card" onSubmit={handleTwoFactorSubmit}>
          <Input
            id="login-2fa-code"
            type="text"
            inputMode="numeric"
            label="Code de vérification"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={6}
            required
            autoFocus
          />
          <div className="form-actions">
            {error && <p className="form-error">{error}</p>}
            <Button type="submit" icon={Check} disabled={loading || code.length !== 6}>
              {loading ? 'Vérification...' : 'Valider'}
            </Button>
            <Button type="button" variant="ghost" icon={ArrowLeft} onClick={cancelTwoFactor}>
              Retour
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-page__intro">
        <img src="/logo-full.png" alt="Madypro Clean" className="auth-page__logo" />
        <h1>Connexion superviseur</h1>
        <p>
          Accédez aux modules Admin / Superviseur pour piloter les équipes de nettoyage, les sites
          clients et les protocoles propreté Madypro Clean.
        </p>
      </div>

      <form className="form-card" onSubmit={handleSubmit}>
        <Input
          id="login-email"
          type="email"
          label="Email professionnel"
          placeholder="vous@madyproclean.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <Input
          id="login-password"
          type="password"
          label="Mot de passe"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <div className="form-actions">
          {error && <p className="form-error">{error}</p>}
          <Button type="submit" icon={LogIn} disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </Button>
          <Link className="btn btn--ghost" to="/forgot-password">
            Mot de passe oublié
          </Link>
        </div>
      </form>
    </div>
  );
};
