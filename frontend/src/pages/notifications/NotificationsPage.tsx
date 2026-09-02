import React, { useEffect, useMemo, useState } from 'react';
import { Send, RotateCcw, Eye } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { Notification, NotificationAudience, NotificationPriority, NotificationTemplate } from '../../types/notification';
import {
  createNotificationTemplate,
  getNotificationReadStats,
  listNotifications,
  listNotificationTemplates,
  NotificationReadStats,
  sendNotification,
  SendNotificationPayload,
  NotificationPage,
} from '../../services/api/notifications.api';
import { listUsers } from '../../services/api/users.api';
import { listSites } from '../../services/api/sites.api';
import { User } from '../../types/user';
import { Site } from '../../types/site';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { Checkbox } from '../../components/ui/Checkbox';
import { Modal, ModalHeader, ModalBody } from '../../components/ui/Modal';
import { formatDateTime } from '../../utils/datetime';

const audienceOptions: { value: NotificationAudience; label: string }[] = [
  { value: 'ALL_AGENTS', label: 'Tous les agents' },
  { value: 'SITE_AGENTS', label: 'Agents d\'un site' },
  { value: 'AGENT', label: 'Agent spécifique' },
];

const priorityOptions: { value: NotificationPriority; label: string; color: string }[] = [
  { value: 'LOW', label: 'Basse', color: '#8a97a8' },
  { value: 'NORMAL', label: 'Normale', color: '#3b82f6' },
  { value: 'HIGH', label: 'Haute', color: '#e08a1e' },
  { value: 'URGENT', label: 'Urgente', color: '#dc2626' },
];

const priorityMeta = (priority?: NotificationPriority) =>
  priorityOptions.find((p) => p.value === priority) ?? priorityOptions[1];

export const NotificationsPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [pageData, setPageData] = useState<NotificationPage>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState<SendNotificationPayload>({
    title: '',
    message: '',
    audience: 'ALL_AGENTS',
    priority: 'NORMAL',
  });
  const [readStats, setReadStats] = useState<Record<string, NotificationReadStats | 'loading'>>({});
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const toggleReadStats = async (id: string) => {
    if (!token) return;
    if (readStats[id]) {
      setReadStats((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setReadStats((prev) => ({ ...prev, [id]: 'loading' }));
    try {
      const stats = await getNotificationReadStats(token, id);
      setReadStats((prev) => ({ ...prev, [id]: stats }));
    } catch {
      setReadStats((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      listNotifications(token, page, pageSize),
      listUsers(token, { role: 'AGENT', status: 'active' }),
      listSites(token),
      listNotificationTemplates(token).catch(() => []),
    ])
      .then(([history, agentList, sitePage, templateList]) => {
        setPageData(history);
        setUsers(agentList.items ?? (agentList as any));
        setSites(sitePage.items ?? (sitePage as any));
        setTemplates(templateList);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les notifications';
        notify(message, 'error');
      })
      .finally(() => setLoading(false));
  }, [token, notify, page, pageSize]);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setForm((prev) => ({
      ...prev,
      title: template.title,
      message: template.message,
      category: template.category,
      priority: template.priority ?? 'NORMAL',
    }));
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAudienceChange = (value: NotificationAudience) => {
    setForm((prev) => ({ ...prev, audience: value, targetId: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (!form.title.trim() || !form.message.trim()) {
      notify('Titre et message requis', 'error');
      return;
    }
    if ((form.audience === 'SITE_AGENTS' || form.audience === 'AGENT') && !form.targetId) {
      notify('Sélectionnez une cible', 'error');
      return;
    }
    setSending(true);
    try {
      const payload: SendNotificationPayload = {
        ...form,
        scheduledFor: form.scheduledFor ? new Date(form.scheduledFor).toISOString() : undefined,
      };
      await sendNotification(token, payload);
      if (saveAsTemplate && templateName.trim()) {
        try {
          const created = await createNotificationTemplate(token, {
            name: templateName.trim(),
            title: form.title,
            message: form.message,
            category: form.category,
            priority: form.priority,
          });
          setTemplates((prev) => [...prev, created]);
        } catch {
          // le modèle n'a pas pu être sauvegardé, la notification est déjà partie
        }
      }
      notify('Notification envoyée');
      setForm({ title: '', message: '', audience: form.audience, priority: 'NORMAL' });
      setSaveAsTemplate(false);
      setTemplateName('');
      setSelectedTemplateId('');
      const history = await listNotifications(token, page, pageSize);
      setPageData(history);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Envoi impossible';
      notify(message, 'error');
    } finally {
      setSending(false);
    }
  };

  const targetSelect = useMemo(() => {
    if (form.audience === 'SITE_AGENTS') {
      return (
        <Select
          label="Site"
          name="targetId"
          value={form.targetId ?? ''}
          onChange={handleChange}
          options={[{ value: '', label: 'Sélectionner' }, ...sites.map((site) => ({ value: site.id, label: site.name }))]}
        />
      );
    }
    if (form.audience === 'AGENT') {
      return (
        <Select
          label="Agent"
          name="targetId"
          value={form.targetId ?? ''}
          onChange={handleChange}
          options={[{ value: '', label: 'Sélectionner' }, ...users.map((user) => ({ value: user.id, label: user.name }))]}
        />
      );
    }
    return null;
  }, [form.audience, form.targetId, sites, users]);

  return (
    <div className="notifications-page">
      <div className="page-hero">
        <div className="page-hero__content">
          <span className="pill">Notifications</span>
          <h2>Informez vos équipes en temps réel</h2>
          <p>Consultez l’historique et envoyez des push ciblés aux agents et superviseurs.</p>
          <Button
            type="button"
            icon={Send}
            onClick={() => {
              setForm({ title: '', message: '', audience: 'ALL_AGENTS' });
              setFormVisible(true);
            }}
          >
            Envoyer une notification
          </Button>
        </div>
      </div>

      <Modal open={formVisible} onClose={() => setFormVisible(false)} maxWidth={900} labelledBy="notification-form-title">
        <ModalHeader
          eyebrow="Push"
          title="Envoyer une notification"
          titleId="notification-form-title"
          onClose={() => setFormVisible(false)}
          actions={
            <Button type="button" variant="ghost" icon={RotateCcw} onClick={() => setForm({ title: '', message: '', audience: 'ALL_AGENTS' })}>
              Réinitialiser
            </Button>
          }
        />
        <ModalBody>
            <form
              className="form-card"
              onSubmit={handleSubmit}
              style={{ boxShadow: 'none', padding: 0, display: 'grid', gap: '1rem' }}
            >
              {templates.length > 0 && (
                <Select
                  label="Modèle réutilisable"
                  value={selectedTemplateId}
                  onChange={(event) => applyTemplate(event.target.value)}
                  options={[
                    { value: '', label: '— Partir de zéro —' },
                    ...templates.map((template) => ({ value: template.id, label: template.name })),
                  ]}
                />
              )}
              <Select
                label="Cible"
                value={form.audience}
                onChange={(event) => handleAudienceChange(event.target.value as NotificationAudience)}
                options={audienceOptions}
              />
              {targetSelect}
              <Input
                id="notifTitle"
                name="title"
                label="Titre"
                value={form.title}
                onChange={handleChange}
                placeholder="Brief, rappel, info..."
                required
              />
              <Textarea
                id="notifMessage"
                name="message"
                label="Message"
                value={form.message}
                onChange={handleChange}
                placeholder="Détail de la notification"
                rows={3}
                required
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Select
                  label="Priorité"
                  name="priority"
                  value={form.priority ?? 'NORMAL'}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, priority: event.target.value as NotificationPriority }))
                  }
                  options={priorityOptions}
                />
                <Input
                  id="notifCategory"
                  name="category"
                  label="Catégorie (optionnel)"
                  value={form.category ?? ''}
                  onChange={handleChange}
                  placeholder="ex. sécurité, planning..."
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Input
                  id="notifScheduledFor"
                  name="scheduledFor"
                  type="datetime-local"
                  label="Envoi différé (optionnel)"
                  value={form.scheduledFor ?? ''}
                  onChange={handleChange}
                />
                {form.audience === 'AGENT' && (
                  <Input
                    id="notifEscalate"
                    name="escalateAfterMinutes"
                    type="number"
                    min={1}
                    label="Escalader si non lue après (min)"
                    value={form.escalateAfterMinutes ?? ''}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        escalateAfterMinutes: event.target.value ? Number(event.target.value) : undefined,
                      }))
                    }
                  />
                )}
              </div>
              <Checkbox
                checked={saveAsTemplate}
                onChange={setSaveAsTemplate}
                label="Enregistrer comme modèle réutilisable"
              />
              {saveAsTemplate && (
                <Input
                  id="notifTemplateName"
                  label="Nom du modèle"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="ex. Rappel consignes sécurité"
                />
              )}
              <div className="form-actions" style={{ marginTop: '0.5rem' }}>
                <Button type="submit" icon={Send} loading={sending}>
                  {form.scheduledFor ? 'Programmer' : 'Envoyer'}
                </Button>
              </div>
            </form>
        </ModalBody>
      </Modal>

      <section className="panel">
        <h3>Historique des notifications</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="historique notifications">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Priorité</th>
                  <th>Titre</th>
                  <th>Message</th>
                  <th>Cible</th>
                  <th>Lu par</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.map((notification) => {
                  const stats = readStats[notification.id];
                  const meta = priorityMeta(notification.priority);
                  return (
                    <React.Fragment key={notification.id}>
                      <tr>
                        <td>
                          {notification.scheduledFor && !notification.sentAt
                            ? `Programmée · ${formatDateTime(notification.scheduledFor)}`
                            : formatDateTime(notification.createdAt)}
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.6rem',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: '#fff',
                              background: meta.color,
                            }}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td>{notification.title}</td>
                        <td>{notification.message}</td>
                        <td>
                          {notification.audience === 'ALL_AGENTS'
                            ? 'Tous les agents'
                            : notification.audience === 'SITE_AGENTS'
                            ? `Site · ${notification.targetName ?? notification.targetId}`
                            : `Agent · ${notification.targetName ?? notification.targetId}`}
                        </td>
                        <td>
                          <Button type="button" variant="ghost" icon={Eye} onClick={() => toggleReadStats(notification.id)}>
                            {stats && stats !== 'loading' ? `${stats.count} lu(s)` : stats === 'loading' ? '…' : 'Voir'}
                          </Button>
                        </td>
                      </tr>
                      {stats && stats !== 'loading' && (
                        <tr>
                          <td colSpan={6} style={{ background: 'var(--color-bg)' }}>
                            {stats.readers.length ? (
                              <div className="chips">
                                {stats.readers.map((reader) => (
                                  <span key={reader.id} className="chip">
                                    {reader.name} · {formatDateTime(reader.readAt)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--color-muted)' }}>Personne n'a encore lu cette notification.</span>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="pagination" style={{ marginTop: '1rem' }}>
        <Button type="button" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Précédent
        </Button>
        <span className="card__meta">Page {page}</span>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            const maxPage = Math.ceil(pageData.total / pageSize) || 1;
            setPage((p) => (p < maxPage ? p + 1 : p));
          }}
          disabled={page * pageSize >= pageData.total}
        >
          Suivant
        </Button>
        <span className="card__meta">{pageData.total} résultats</span>
      </div>
    </div>
  );
};
