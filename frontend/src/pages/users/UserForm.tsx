import React from 'react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { CreateUserPayload } from '../../services/api/users.api';
import { Save, X } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPERVISOR', label: 'Superviseur' },
  { value: 'AGENT', label: 'Agent' },
];

type UserFormProps = {
  value: CreateUserPayload;
  onChange: (field: keyof CreateUserPayload, value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
  isEdit?: boolean;
  submitting?: boolean;
};

/**
 * Champs communs de création/édition d'un utilisateur — partagés entre
 * UserFormPage (page dédiée) et UsersListPage (création rapide en modale)
 * pour éviter que les deux jeux de champs divergent.
 */
export const UserForm: React.FC<UserFormProps> = ({ value, onChange, onSubmit, onCancel, isEdit, submitting }) => (
  <form className="form-card" onSubmit={onSubmit} style={{ boxShadow: 'none', padding: 0, display: 'grid', gap: '1rem' }}>
    <Input label="Prénom" value={value.firstName} onChange={(e) => onChange('firstName', e.target.value)} required />
    <Input label="Nom" value={value.lastName} onChange={(e) => onChange('lastName', e.target.value)} required />
    <Input type="email" label="Email" value={value.email} onChange={(e) => onChange('email', e.target.value)} required />
    <Input label="Téléphone" value={value.phone} onChange={(e) => onChange('phone', e.target.value)} />
    <Select label="Rôle" value={value.role} onChange={(e) => onChange('role', e.target.value)} options={ROLE_OPTIONS} />
    <Input
      type="password"
      label={isEdit ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}
      value={value.password}
      onChange={(e) => onChange('password', e.target.value)}
      required={!isEdit}
      placeholder={isEdit ? 'Laisser vide pour conserver l’actuel' : 'Au moins 6 caractères'}
    />
    <div className="form-actions">
      <Button type="submit" icon={Save} loading={submitting}>
        Enregistrer
      </Button>
      <Button type="button" variant="ghost" icon={X} onClick={onCancel}>
        Annuler
      </Button>
    </div>
  </form>
);
