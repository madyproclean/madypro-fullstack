import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { ApiKey, PortalToken } from '../../types/platform';
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  listPortalTokens,
  createPortalToken,
  revokePortalToken,
} from '../../services/api/platform.api';
import { listSites } from '../../services/api/sites.api';
import { Site } from '../../types/site';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { formatDateTime } from '../../utils/datetime';
import { env } from '../../config/env';
import { Check, Plus, Power, Link as LinkIcon } from 'lucide-react';

export const ApiKeysPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [portalTokens, setPortalTokens] = useState<PortalToken[]>([]);
  const [creatingToken, setCreatingToken] = useState(false);

  const loadApiKeys = () => {
    if (!token) return;
    setLoading(true);
    listApiKeys(token)
      .then(setApiKeys)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger les clés API', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(loadApiKeys, [token]);

  useEffect(() => {
    if (!token) return;
    listSites(token, { pageSize: 200 })
      .then((data) => setSites(data.items))
      .catch(() => setSites([]));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    listPortalTokens(token)
      .then(setPortalTokens)
      .catch(() => setPortalTokens([]));
  }, [token]);

  const handleCreateKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !label.trim()) return;
    setCreating(true);
    try {
      const created = await createApiKey(token, label.trim());
      setRevealedKey(created.key);
      setLabel('');
      loadApiKeys();
      notify('Clé API créée');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Création impossible', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async (key: ApiKey) => {
    if (!token) return;
    try {
      await revokeApiKey(token, key.id);
      notify('Clé révoquée');
      loadApiKeys();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Révocation impossible', 'error');
    }
  };

  const handleCreateToken = async () => {
    if (!token || !selectedSiteId) return;
    setCreatingToken(true);
    try {
      await createPortalToken(token, selectedSiteId);
      notify('Jeton de portail créé');
      const refreshed = await listPortalTokens(token);
      setPortalTokens(refreshed);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Création impossible', 'error');
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeToken = async (portalToken: PortalToken) => {
    if (!token) return;
    try {
      await revokePortalToken(token, portalToken.id);
      notify('Jeton révoqué');
      const refreshed = await listPortalTokens(token);
      setPortalTokens(refreshed);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Révocation impossible', 'error');
    }
  };

  const portalUrl = (portalToken: PortalToken) => `${env.apiUrl.replace(/\/$/, '')}/public-api/portal/${portalToken.token}`;

  return (
    <div>
      <div className="page-header">
        <span className="pill">Paramètres</span>
        <h2>Clés API & portail client</h2>
        <p>Gérez les accès programmatiques et les liens de suivi partagés avec vos clients.</p>
        <a href={`${env.apiUrl.replace(/\/$/, '')}/api/docs`} target="_blank" rel="noreferrer" className="btn btn--ghost">
          Documentation API (Swagger)
        </a>
      </div>

      {revealedKey && (
        <div className="settings-card" style={{ marginBottom: '1rem', borderColor: '#16a34a' }}>
          <span className="card__meta">Clé API (affichée une seule fois)</span>
          <p style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{revealedKey}</p>
          <Button type="button" variant="ghost" icon={Check} onClick={() => setRevealedKey(null)}>
            J’ai copié la clé
          </Button>
        </div>
      )}

      <form className="form-card" onSubmit={handleCreateKey} style={{ marginBottom: '1.5rem' }}>
        <div className="form-row">
          <Input
            id="apiKeyLabel"
            label="Libellé de la clé"
            placeholder="Intégration comptabilité"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            required
          />
          <div className="form-actions">
            <Button type="submit" icon={Plus} disabled={creating || !label.trim()}>
              {creating ? 'Création...' : 'Créer la clé'}
            </Button>
          </div>
        </div>
      </form>

      <section className="panel">
        <h3>Clés API</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : apiKeys.length === 0 ? (
          <p className="card__meta">Aucune clé API créée.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="clés API">
              <thead>
                <tr>
                  <th>Libellé</th>
                  <th>Statut</th>
                  <th>Créée le</th>
                  <th>Dernière utilisation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.label}</td>
                    <td>{key.active ? 'Active' : 'Révoquée'}</td>
                    <td>{formatDateTime(key.createdAt)}</td>
                    <td>{key.lastUsedAt ? formatDateTime(key.lastUsedAt) : 'Jamais'}</td>
                    <td>
                      {key.active && (
                        <Button type="button" variant="ghost" className="btn--compact" icon={Power} onClick={() => handleRevokeKey(key)}>
                          Révoquer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h3>Jetons de portail client</h3>
        <p>Générez un lien de suivi en lecture seule à partager avec le client d’un site.</p>
        <div className="form-row">
          <Select
            id="portalSite"
            label="Site"
            options={sites.map((site) => ({ value: site.id, label: site.name }))}
            value={selectedSiteId}
            onChange={(event) => setSelectedSiteId(event.target.value)}
          />
          <div className="form-actions">
            <Button type="button" icon={LinkIcon} onClick={handleCreateToken} disabled={creatingToken || !selectedSiteId}>
              {creatingToken ? 'Création...' : 'Générer un lien'}
            </Button>
          </div>
        </div>
        {portalTokens.length === 0 ? (
          <p className="card__meta">Aucun jeton de portail généré.</p>
        ) : (
          <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
            <table className="table" aria-label="jetons de portail client">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Lien</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {portalTokens.map((portalToken) => (
                  <tr key={portalToken.id}>
                    <td>{portalToken.site?.name ?? portalToken.siteId}</td>
                    <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {portalToken.active ? portalUrl(portalToken) : '—'}
                    </td>
                    <td>{portalToken.active ? 'Actif' : 'Révoqué'}</td>
                    <td>
                      {portalToken.active && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="btn--compact"
                          icon={Power}
                          onClick={() => handleRevokeToken(portalToken)}
                        >
                          Révoquer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
