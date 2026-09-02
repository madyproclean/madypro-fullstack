import React, { useState } from 'react';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useAuthContext } from '../../context/AuthContext';
import { setupTwoFactor, confirmTwoFactor, disableTwoFactor } from '../../services/api/auth.api';
import { Shield, Check, X, Power } from 'lucide-react';

export const SecuritySettingsPage: React.FC = () => {
  const { token, user, notify, login } = useAuthContext();
  const [enabled, setEnabled] = useState(Boolean(user?.twoFactorEnabled));
  const [setupData, setSetupData] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [loading, setLoading] = useState(false);

  const startSetup = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await setupTwoFactor(token);
      setSetupData(data);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de démarrer la configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      await confirmTwoFactor(token, confirmCode);
      notify('Authentification à deux facteurs activée');
      setEnabled(true);
      setSetupData(null);
      setConfirmCode('');
      if (user) login({ ...user, twoFactorEnabled: true }, token);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Code invalide', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      await disableTwoFactor(token, disablePassword);
      notify('Authentification à deux facteurs désactivée');
      setEnabled(false);
      setDisablePassword('');
      if (user) login({ ...user, twoFactorEnabled: false }, token);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Mot de passe incorrect', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <span className="pill">Paramètres</span>
        <h2>Sécurité</h2>
        <p>Protégez votre compte avec une double authentification.</p>
      </div>

      <div className="settings-grid">
        <article className="settings-card" style={{ gridColumn: 'span 2' }}>
          <span className="card__meta">Authentification à deux facteurs</span>
          <h3>{enabled ? 'Activée' : 'Désactivée'}</h3>

          {!enabled && !setupData && (
            <div className="form-actions" style={{ marginTop: '1rem' }}>
              <Button type="button" icon={Shield} onClick={startSetup} disabled={loading}>
                {loading ? 'Génération...' : 'Activer la 2FA'}
              </Button>
            </div>
          )}

          {!enabled && setupData && (
            <form onSubmit={confirmSetup} style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
              <p>Scannez ce QR code avec votre application d’authentification (Google Authenticator, Authy…).</p>
              <img
                src={setupData.qrCodeDataUrl}
                alt="QR code d'activation 2FA"
                style={{ width: 200, height: 200, borderRadius: '12px', border: '1px solid var(--color-border)' }}
              />
              <p className="card__meta">Secret manuel : {setupData.secret}</p>
              <Input
                id="confirm2faCode"
                label="Code de vérification"
                placeholder="123456"
                value={confirmCode}
                onChange={(event) => setConfirmCode(event.target.value)}
                maxLength={6}
                required
              />
              <div className="form-actions">
                <Button type="submit" icon={Check} disabled={loading || confirmCode.length !== 6}>
                  {loading ? 'Vérification...' : 'Confirmer l’activation'}
                </Button>
                <Button type="button" variant="ghost" icon={X} onClick={() => setSetupData(null)}>
                  Annuler
                </Button>
              </div>
            </form>
          )}

          {enabled && (
            <form onSubmit={handleDisable} style={{ marginTop: '1rem', display: 'grid', gap: '1rem', maxWidth: '360px' }}>
              <p>Entrez votre mot de passe pour désactiver la 2FA.</p>
              <Input
                id="disable2faPassword"
                type="password"
                label="Mot de passe"
                value={disablePassword}
                onChange={(event) => setDisablePassword(event.target.value)}
                required
              />
              <div className="form-actions">
                <Button type="submit" variant="ghost" icon={Power} disabled={loading}>
                  {loading ? 'Désactivation...' : 'Désactiver la 2FA'}
                </Button>
              </div>
            </form>
          )}
        </article>
      </div>
    </div>
  );
};
