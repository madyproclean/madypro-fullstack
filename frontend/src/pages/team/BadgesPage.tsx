import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { Badge, UserBadge } from '../../types/team';
import { User } from '../../types/user';
import { listBadges, createBadge, listBadgeAwards, awardBadge, revokeBadgeAward } from '../../services/api/team.api';
import { listUsers } from '../../services/api/users.api';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { formatDateTime } from '../../utils/datetime';
import { Plus, Award, Trash2 } from 'lucide-react';

export const BadgesPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [awards, setAwards] = useState<UserBadge[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [newBadge, setNewBadge] = useState({ code: '', label: '' });
  const [awardForm, setAwardForm] = useState({ userId: '', badgeId: '', period: '', note: '' });

  const load = () => {
    if (!token) return;
    listBadges(token).then(setBadges).catch(() => {});
    listBadgeAwards(token).then(setAwards).catch(() => {});
    listUsers(token, { pageSize: 200 }).then((res) => setUsers(res.items)).catch(() => {});
  };

  useEffect(load, [token]);

  const handleCreateBadge = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !newBadge.code.trim() || !newBadge.label.trim()) return;
    try {
      await createBadge(token, { code: newBadge.code.trim(), label: newBadge.label.trim() });
      setNewBadge({ code: '', label: '' });
      load();
      notify('Badge créé');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Création impossible', 'error');
    }
  };

  const handleAward = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !awardForm.userId || !awardForm.badgeId) return;
    try {
      await awardBadge(token, {
        userId: awardForm.userId,
        badgeId: awardForm.badgeId,
        period: awardForm.period || undefined,
        note: awardForm.note || undefined,
      });
      setAwardForm({ userId: '', badgeId: '', period: '', note: '' });
      load();
      notify('Badge attribué');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Attribution impossible', 'error');
    }
  };

  const handleRevoke = async (id: string) => {
    if (!token) return;
    await revokeBadgeAward(token, id).catch(() => {});
    load();
  };

  return (
    <div>
      <div className="page-header">
        <span className="pill">Équipes</span>
        <h2>Badges & reconnaissance</h2>
        <p>Catalogue de badges et attributions aux agents.</p>
      </div>

      <div className="settings-grid">
        <article className="settings-card">
          <span className="card__meta">Catalogue</span>
          <h3>Nouveau badge</h3>
          <form className="form-row" onSubmit={handleCreateBadge}>
            <Input
              label="Code"
              value={newBadge.code}
              onChange={(event) => setNewBadge((prev) => ({ ...prev, code: event.target.value }))}
              placeholder="AGENT_OF_MONTH"
            />
            <Input
              label="Libellé"
              value={newBadge.label}
              onChange={(event) => setNewBadge((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Agent du mois"
            />
            <Button type="submit" icon={Plus}>Créer</Button>
          </form>
          <div className="chips" style={{ marginTop: '1rem' }}>
            {badges.map((badge) => (
              <span key={badge.id} className="chip">
                {badge.label}
              </span>
            ))}
          </div>
        </article>

        <article className="settings-card">
          <span className="card__meta">Attribution</span>
          <h3>Attribuer un badge</h3>
          <form className="form-row" onSubmit={handleAward}>
            <Select
              label="Agent"
              value={awardForm.userId}
              onChange={(event) => setAwardForm((prev) => ({ ...prev, userId: event.target.value }))}
              options={[{ value: '', label: 'Sélectionner' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
            />
            <Select
              label="Badge"
              value={awardForm.badgeId}
              onChange={(event) => setAwardForm((prev) => ({ ...prev, badgeId: event.target.value }))}
              options={[{ value: '', label: 'Sélectionner' }, ...badges.map((b) => ({ value: b.id, label: b.label }))]}
            />
            <Input
              label="Période (optionnel)"
              placeholder="2026-08"
              value={awardForm.period}
              onChange={(event) => setAwardForm((prev) => ({ ...prev, period: event.target.value }))}
            />
            <Button type="submit" icon={Award}>Attribuer</Button>
          </form>
        </article>
      </div>

      <section className="panel" style={{ marginTop: '1.5rem' }}>
        <h3>Attributions récentes</h3>
        <div className="table-wrapper">
          <table className="table" aria-label="attributions de badges">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Badge</th>
                <th>Période</th>
                <th>Attribué le</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {awards.map((award) => {
                const user = users.find((u) => u.id === award.userId);
                return (
                  <tr key={award.id}>
                    <td>{user?.name ?? award.userId}</td>
                    <td>{award.badge.label}</td>
                    <td>{award.period ?? '—'}</td>
                    <td>{formatDateTime(award.awardedAt)}</td>
                    <td>
                      <Button type="button" variant="ghost" icon={Trash2} onClick={() => handleRevoke(award.id)}>
                        Retirer
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
