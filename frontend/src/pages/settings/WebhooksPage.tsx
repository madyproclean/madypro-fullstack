import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { Webhook, WEBHOOK_EVENTS } from '../../types/webhook';
import {
  listWebhooks,
  createWebhook,
  updateWebhookStatus,
  rotateWebhookSecret,
  deleteWebhook,
} from '../../services/api/webhooks.api';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { formatDateTime } from '../../utils/datetime';
import { Check, Plus, Power, KeyRound, Trash2 } from 'lucide-react';

export const WebhooksPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);

  const load = () => {
    if (!token) return;
    setLoading(true);
    listWebhooks(token)
      .then(setWebhooks)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger les webhooks', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !url.trim() || !selectedEvents.length) {
      notify('URL et au moins un événement requis', 'error');
      return;
    }
    setCreating(true);
    try {
      const created = await createWebhook(token, url.trim(), selectedEvents);
      notify('Webhook créé');
      setRevealedSecret({ id: created.id, secret: created.secret });
      setUrl('');
      setSelectedEvents([]);
      setFormVisible(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Création impossible', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (webhook: Webhook) => {
    if (!token) return;
    try {
      await updateWebhookStatus(token, webhook.id, !webhook.active);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Mise à jour impossible', 'error');
    }
  };

  const handleRotate = async (webhook: Webhook) => {
    if (!token) return;
    try {
      const result = await rotateWebhookSecret(token, webhook.id);
      setRevealedSecret({ id: webhook.id, secret: result.secret });
      notify('Secret régénéré');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Rotation impossible', 'error');
    }
  };

  const handleDelete = async (webhook: Webhook) => {
    if (!token) return;
    try {
      await deleteWebhook(token, webhook.id);
      notify('Webhook supprimé');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <span className="pill">Paramètres</span>
        <h2>Webhooks</h2>
        <p>Intégrations sortantes : notifiez vos outils tiers en temps réel (paie, messagerie, CRM…).</p>
        <Button type="button" onClick={() => setFormVisible((v) => !v)}>
          {formVisible ? 'Fermer' : 'Nouveau webhook'}
        </Button>
      </div>

      {revealedSecret && (
        <div className="settings-card" style={{ marginBottom: '1rem', borderColor: '#16a34a' }}>
          <span className="card__meta">Secret (affiché une seule fois)</span>
          <p style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{revealedSecret.secret}</p>
          <Button type="button" variant="ghost" icon={Check} onClick={() => setRevealedSecret(null)}>
            J’ai copié le secret
          </Button>
        </div>
      )}

      {formVisible && (
        <form className="form-card" onSubmit={handleCreate} style={{ marginBottom: '1.5rem' }}>
          <Input
            id="webhookUrl"
            label="URL de destination"
            placeholder="https://votre-outil.com/webhooks/madypro"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
          />
          <div className="form-field">
            <span>Événements</span>
            <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.5rem' }}>
              {WEBHOOK_EVENTS.map((eventName) => (
                <Checkbox
                  key={eventName}
                  checked={selectedEvents.includes(eventName)}
                  onChange={() => toggleEvent(eventName)}
                  label={<span style={{ fontFamily: 'monospace' }}>{eventName}</span>}
                />
              ))}
            </div>
          </div>
          <div className="form-actions">
            <Button type="submit" icon={Plus} loading={creating}>
              Créer le webhook
            </Button>
          </div>
        </form>
      )}

      <section className="panel">
        <h3>Webhooks configurés</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : webhooks.length === 0 ? (
          <p className="card__meta">Aucun webhook configuré.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="webhooks">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Événements</th>
                  <th>Statut</th>
                  <th>Créé le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map((webhook) => (
                  <tr key={webhook.id}>
                    <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {webhook.url}
                    </td>
                    <td>
                      <div className="chips">
                        {webhook.events.map((eventName) => (
                          <span key={eventName} className="chip">
                            {eventName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{webhook.active ? 'Actif' : 'Désactivé'}</td>
                    <td>{formatDateTime(webhook.createdAt)}</td>
                    <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <Button type="button" variant="ghost" icon={Power} onClick={() => handleToggleActive(webhook)}>
                        {webhook.active ? 'Désactiver' : 'Activer'}
                      </Button>
                      <Button type="button" variant="ghost" icon={KeyRound} onClick={() => handleRotate(webhook)}>
                        Régénérer le secret
                      </Button>
                      <Button type="button" variant="ghost" icon={Trash2} onClick={() => handleDelete(webhook)}>
                        Supprimer
                      </Button>
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
