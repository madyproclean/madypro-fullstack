import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { resetPassword } from '../../services/api/auth.api';
import { RotateCcw } from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lien invalide ou expiré';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__intro">
        <span className="pill">Support Madypro Clean</span>
        <h1>Choisir un nouveau mot de passe</h1>
        <p>Définissez un nouveau mot de passe pour votre compte Madypro Clean.</p>
      </div>

      {submitted ? (
        <div className="form-card">
          <p>Votre mot de passe a été mis à jour.</p>
          <div className="form-actions">
            <Link to="/login" className="btn btn--primary">
              Se connecter
            </Link>
          </div>
        </div>
      ) : !token ? (
        <div className="form-card">
          <p className="form-error">Ce lien de réinitialisation est invalide.</p>
          <div className="form-actions">
            <Link to="/forgot-password" className="btn btn--ghost">
              Renvoyer un lien
            </Link>
          </div>
        </div>
      ) : (
        <form className="form-card" onSubmit={handleSubmit}>
          <Input
            id="reset-new-password"
            type="password"
            label="Nouveau mot de passe"
            placeholder="••••••••"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
          <Input
            id="reset-confirm-password"
            type="password"
            label="Confirmer le mot de passe"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
          {error && (
            <>
              <p className="form-error">{error}</p>
              {error === 'Lien invalide ou expiré' && (
                <Link to="/forgot-password" className="btn btn--ghost">
                  Renvoyer un lien
                </Link>
              )}
            </>
          )}
          <div className="form-actions">
            <Button type="submit" icon={RotateCcw} disabled={loading}>
              {loading ? 'Mise à jour...' : 'Réinitialiser'}
            </Button>
            <Link to="/login" className="btn btn--ghost">
              Retour connexion
            </Link>
          </div>
        </form>
      )}
    </div>
  );
};
