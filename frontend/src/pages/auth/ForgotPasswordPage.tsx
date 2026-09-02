import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { requestPasswordReset } from '../../services/api/auth.api';
import { RotateCcw } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de réinitialiser le mot de passe';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-page__intro">
        <span className="pill">Support Madypro Clean</span>
        <h1>Réinitialiser le mot de passe</h1>
        <p>
          Envoyez un lien sécurisé à votre adresse professionnelle pour reprendre le contrôle du
          portail Admin / Superviseur Madypro Clean et de ses opérations de nettoyage.
        </p>
      </div>

      {submitted ? (
        <div className="form-card">
          <p>
            Si un compte existe avec cette adresse, un email contenant un lien de réinitialisation
            vient d'être envoyé.
          </p>
          <div className="form-actions">
            <Link to="/login" className="btn btn--ghost">
              Retour connexion
            </Link>
          </div>
        </div>
      ) : (
        <form className="form-card" onSubmit={handleSubmit}>
          <Input
            id="reset-email"
            type="email"
            label="Email professionnel"
            placeholder="vous@madyproclean.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {error && <p className="form-error">{error}</p>}
          <div className="form-actions">
            <Button type="submit" icon={RotateCcw} disabled={loading}>
              {loading ? 'Envoi…' : 'Réinitialiser'}
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
