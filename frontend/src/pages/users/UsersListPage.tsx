import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listUsers,
  updateUserStatus,
  resetUserPassword,
  createUser,
  CreateUserPayload,
} from '../../services/api/users.api';
import { User } from '../../types/user';
import { Button } from '../../components/ui/Button';
import { Modal, ModalHeader, ModalBody } from '../../components/ui/Modal';
import { FilterBar, FilterField } from '../../components/ui/FilterBar';
import { useAuthContext } from '../../context/AuthContext';
import { UserForm } from './UserForm';
import { listAttendance } from '../../services/api/attendance.api';
import { Attendance } from '../../types/attendance';
import { Plus, RotateCcw, Power, KeyRound, ChevronLeft, ChevronRight } from 'lucide-react';

const EMPTY_CREATE_FORM: CreateUserPayload = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  role: 'AGENT',
  password: '',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  SUPERVISOR: 'Superviseur',
  AGENT: 'Agent',
};

export const UsersListPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ search: '', role: 'all', status: 'all' });
  const [formVisible, setFormVisible] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserPayload>(EMPTY_CREATE_FORM);
  const [creating, setCreating] = useState(false);
  const [liveNotes, setLiveNotes] = useState<Array<{ id: string; text: string }>>([]);
  const { token, notify } = useAuthContext();

  useEffect(() => {
    if (!token) {
      return;
    }
    listUsers(token, {
      search: filters.search,
      role: filters.role !== 'all' ? filters.role : undefined,
      status: filters.status !== 'all' ? (filters.status as 'active' | 'inactive') : undefined,
      page,
      pageSize,
    })
      .then((data) => {
        setUsers(data.items);
        setTotal(data.total);
        setError(null);
        notify('Utilisateurs chargés', 'success');
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Impossible de charger les utilisateurs';
        setError(message);
        setUsers([]);
        notify(message, 'error');
      });
  }, [token, filters, page]);

  useEffect(() => {
    if (!token) return;
    const today = new Date().toISOString().slice(0, 10);
    listAttendance(token, { startDate: today, endDate: today, status: 'all', page: 1, pageSize: 50 })
      .then((data) => {
        const items = (data as any)?.items ?? (data as any as Attendance[]);
        const notes = items
          .sort((a: Attendance, b: Attendance) => (b.checkInTime || '').localeCompare(a.checkInTime || ''))
          .slice(0, 5)
          .map((att: Attendance) => {
            const status =
              att.status === 'CANCELLED'
                ? 'Annulé'
                : att.checkOutTime
                ? `Sortie ${att.checkOutTime}`
                : att.checkInTime
                ? `Entrée ${att.checkInTime}`
                : 'En attente';
            return {
              id: att.id,
              text: `${att.agent.name} · ${att.site.name} · ${status}`,
            };
          });
        setLiveNotes(notes);
      })
      .catch(() => setLiveNotes([]));
  }, [token]);

  const handleStatusToggle = async (user: User) => {
    if (!token) return;
    try {
      const updated = await updateUserStatus(token, user.id, !user.active);
      setUsers((prev) => prev.map((item) => (item.id === user.id ? updated : item)));
      notify(!user.active ? 'Utilisateur activé' : 'Utilisateur désactivé', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible de mettre à jour l'utilisateur";
      setError(message);
      notify(message, 'error');
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!token) return;
    try {
      const result = await resetUserPassword(token, user.id);
      notify(`Nouveau mot de passe pour ${user.firstName} ${user.lastName} : ${result.password}`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de réinitialiser le mot de passe';
      setError(message);
      notify(message, 'error');
    }
  };

  const handleCreateChange = (field: keyof CreateUserPayload, value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setCreating(true);
    try {
      const newUser = await createUser(token, createForm);
      setUsers((prev) => [newUser, ...prev]);
      notify('Utilisateur créé', 'success');
      setCreateForm(EMPTY_CREATE_FORM);
      setFormVisible(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de créer le compte';
      notify(message, 'error');
    } finally {
      setCreating(false);
    }
  };

  const openCreateModal = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setFormVisible(true);
  };

  return (
    <div>
      <div className="page-hero">
        <div className="page-hero__content">
          <span className="pill">Coordination Madypro Clean</span>
          <h2>Vos talents propreté</h2>
          <p>
            Chaque fiche valorise les responsables de sites et agents de nettoyage : zones
            d’intervention, statuts en temps réel et contacts directs.
          </p>
          <Button type="button" icon={Plus} onClick={openCreateModal}>
            Créer un utilisateur
          </Button>
        </div>
        <div className="page-hero__accent">
          <h3>Notes live</h3>
          <ul className="list-line">
            {liveNotes.length === 0 && <li>Aucun pointage aujourd’hui.</li>}
            {liveNotes.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ul>
        </div>
      </div>

      <Modal open={formVisible} onClose={() => setFormVisible(false)} maxWidth={900} labelledBy="user-create-title">
        <ModalHeader
          eyebrow="Utilisateur"
          title="Nouvel utilisateur"
          titleId="user-create-title"
          onClose={() => setFormVisible(false)}
          actions={
            <Button type="button" variant="ghost" icon={RotateCcw} onClick={() => setCreateForm(EMPTY_CREATE_FORM)}>
              Réinitialiser
            </Button>
          }
        />
        <ModalBody>
          <UserForm
            value={createForm}
            onChange={handleCreateChange}
            onSubmit={handleCreateSubmit}
            onCancel={() => setFormVisible(false)}
            submitting={creating}
          />
        </ModalBody>
      </Modal>

      <FilterBar>
        <FilterField label="Recherche" wide>
          <input
            type="text"
            value={filters.search}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            placeholder="Nom ou email"
          />
        </FilterField>
        <FilterField label="Rôle">
          <select
            value={filters.role}
            onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}
          >
            <option value="all">Tous</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPERVISOR">Superviseur</option>
            <option value="AGENT">Agent</option>
          </select>
        </FilterField>
        <FilterField label="Statut">
          <select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>
        </FilterField>
      </FilterBar>

      {error && <p className="form-error">{error}</p>}

      <div className="page-grid">
        {Array.isArray(users) &&
          users.map((employee) => (
            <article key={employee.id} className="card">
              <span className="card__meta">{ROLE_LABELS[employee.role?.toUpperCase()] ?? employee.role}</span>
              <h3>{employee.firstName} {employee.lastName}</h3>
            <p>
              <span
                className={`status-chip ${
                  employee.active ? 'status-chip--success' : 'status-chip--warning'
                }`}
              >
                {employee.active ? 'Actif' : 'Inactif'}
              </span>
            </p>
            <p>Tél : {employee.phone}</p>
            <p>Email : {employee.email}</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link to={`/supervision/agents/${employee.id}`} className="btn btn--ghost">
                Fiche complète
              </Link>
              <Link to={`/users/${employee.id}/edit`} className="btn btn--ghost">
                Modifier
              </Link>
              <Button type="button" variant="ghost" icon={Power} onClick={() => handleStatusToggle(employee)}>
                {employee.active ? 'Désactiver' : 'Activer'}
              </Button>
              <Button type="button" variant="ghost" icon={KeyRound} onClick={() => handleResetPassword(employee)}>
                Réinitialiser
              </Button>
            </div>
          </article>
          ))}
      </div>

      <div className="pagination" style={{ marginTop: '1.5rem' }}>
        <Button type="button" variant="ghost" icon={ChevronLeft} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          Précédent
        </Button>
        <span className="card__meta">Page {page}</span>
        <Button
          type="button"
          variant="ghost"
          icon={ChevronRight}
          iconPosition="right"
          onClick={() => {
            const maxPage = Math.ceil(total / pageSize) || 1;
            setPage((p) => (p < maxPage ? p + 1 : p));
          }}
          disabled={page * pageSize >= total}
        >
          Suivant
        </Button>
        <span className="card__meta">{total} résultats</span>
      </div>
    </div>
  );
};
