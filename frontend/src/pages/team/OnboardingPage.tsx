import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import { OnboardingTemplateItem, UserOnboardingItem } from '../../types/team';
import { User } from '../../types/user';
import {
  listOnboardingTemplate,
  createOnboardingTemplateItem,
  deleteOnboardingTemplateItem,
  getUserOnboarding,
  seedUserOnboarding,
  setOnboardingItemDone,
} from '../../services/api/team.api';
import { listUsers } from '../../services/api/users.api';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Trash2, Plus, Play } from 'lucide-react';

export const OnboardingPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [template, setTemplate] = useState<OnboardingTemplateItem[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userItems, setUserItems] = useState<UserOnboardingItem[]>([]);

  const loadTemplate = () => {
    if (!token) return;
    listOnboardingTemplate(token).then(setTemplate).catch(() => {});
  };

  useEffect(loadTemplate, [token]);
  useEffect(() => {
    if (!token) return;
    listUsers(token, { role: 'AGENT', pageSize: 200 }).then((res) => setUsers(res.items)).catch(() => {});
  }, [token]);

  const loadUserItems = (userId: string) => {
    if (!token || !userId) {
      setUserItems([]);
      return;
    }
    getUserOnboarding(token, userId).then(setUserItems).catch(() => {});
  };

  const handleAddTemplateItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !newLabel.trim()) return;
    try {
      await createOnboardingTemplateItem(token, { label: newLabel.trim(), order: template.length });
      setNewLabel('');
      loadTemplate();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Ajout impossible', 'error');
    }
  };

  const handleRemoveTemplateItem = async (id: string) => {
    if (!token) return;
    await deleteOnboardingTemplateItem(token, id).catch(() => {});
    loadTemplate();
  };

  const handleSeed = async () => {
    if (!token || !selectedUserId) return;
    try {
      const items = await seedUserOnboarding(token, selectedUserId);
      setUserItems(items);
      notify('Checklist lancée pour cet agent');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Lancement impossible', 'error');
    }
  };

  const toggleItem = async (item: UserOnboardingItem) => {
    if (!token) return;
    try {
      await setOnboardingItemDone(token, item.id, !item.done);
      loadUserItems(selectedUserId);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Mise à jour impossible', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <span className="pill">Équipes</span>
        <h2>Onboarding</h2>
        <p>Modèle d’étapes pour les nouveaux agents et suivi individuel.</p>
      </div>

      <div className="settings-grid">
        <article className="settings-card">
          <span className="card__meta">Modèle</span>
          <h3>Étapes standard</h3>
          <ul className="list-line">
            {template.map((item) => (
              <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {item.label}
                <Button type="button" variant="ghost" icon={Trash2} onClick={() => handleRemoveTemplateItem(item.id)}>
                  Retirer
                </Button>
              </li>
            ))}
          </ul>
          <form className="form-row" onSubmit={handleAddTemplateItem} style={{ marginTop: '1rem' }}>
            <Input
              label="Nouvelle étape"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="Signer le contrat"
            />
            <Button type="submit" icon={Plus}>Ajouter</Button>
          </form>
        </article>

        <article className="settings-card">
          <span className="card__meta">Suivi par agent</span>
          <h3>Checklist individuelle</h3>
          <Select
            label="Agent"
            value={selectedUserId}
            onChange={(event) => {
              setSelectedUserId(event.target.value);
              loadUserItems(event.target.value);
            }}
            options={[{ value: '', label: 'Sélectionner' }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
          />
          {selectedUserId && userItems.length === 0 && (
            <Button type="button" icon={Play} onClick={handleSeed} style={{ marginTop: '1rem' }}>
              Lancer l’onboarding
            </Button>
          )}
          {userItems.length > 0 && (
            <ul className="list-line" style={{ marginTop: '1rem' }}>
              {userItems.map((item) => (
                <li key={item.id}>
                  <Checkbox checked={item.done} onChange={() => toggleItem(item)} label={item.label} />
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </div>
  );
};
