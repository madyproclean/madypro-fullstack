import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { UserForm } from './UserForm';
import {
  createUser,
  getUser,
  updateUser,
  updateUserPermissions,
  CreateUserPayload,
  UpdateUserPayload,
} from '../../services/api/users.api';
import {
  listCertifications,
  createCertification,
  deleteCertification,
  listEmployeeDocuments,
  createEmployeeDocument,
  deleteEmployeeDocument,
} from '../../services/api/team.api';
import { Certification, EmployeeDocument } from '../../types/team';
import { useAuthContext } from '../../context/AuthContext';
import { env } from '../../config/env';
import { Save, Trash2, Plus } from 'lucide-react';

type AddressSuggestion = {
  id: string;
  label: string;
  longitude?: number;
  latitude?: number;
};

const PERMISSION_OPTIONS = [
  { value: 'settings:manage', label: 'Gérer les paramètres' },
  { value: 'users:manage', label: 'Gérer les utilisateurs' },
  { value: 'reports:export', label: 'Exporter les rapports' },
  { value: 'webhooks:manage', label: 'Gérer les webhooks' },
];

const DEFAULT_FORM: CreateUserPayload = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  role: 'AGENT',
  password: '',
};

export const UserFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { token, notify } = useAuthContext();
  const [form, setForm] = useState<CreateUserPayload>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [newCert, setNewCert] = useState({ label: '', expiresAt: '' });
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [newDoc, setNewDoc] = useState({ type: 'CONTRACT', label: '', file: null as File | null });
  const [coords, setCoords] = useState<{ latitude?: number; longitude?: number }>({});
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSelected, setAddressSelected] = useState(false);
  const mapboxToken = env.mapboxToken;

  const loadTeamExtras = React.useCallback(() => {
    if (!token || !id) return;
    listCertifications(token, id).then(setCertifications).catch(() => {});
    listEmployeeDocuments(token, id).then(setDocuments).catch(() => {});
  }, [token, id]);

  useEffect(loadTeamExtras, [loadTeamExtras]);

  const submitCertification = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !id || !newCert.label.trim()) return;
    try {
      await createCertification(token, {
        userId: id,
        label: newCert.label.trim(),
        expiresAt: newCert.expiresAt || undefined,
      });
      setNewCert({ label: '', expiresAt: '' });
      loadTeamExtras();
      notify('Habilitation ajoutée', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible d’ajouter', 'error');
    }
  };

  const removeCertification = async (certId: string) => {
    if (!token) return;
    await deleteCertification(token, certId).catch(() => {});
    loadTeamExtras();
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const submitDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !id || !newDoc.file || !newDoc.label.trim()) return;
    try {
      const fileUrl = await readFileAsBase64(newDoc.file);
      await createEmployeeDocument(token, { userId: id, type: newDoc.type, label: newDoc.label.trim(), fileUrl });
      setNewDoc({ type: 'CONTRACT', label: '', file: null });
      loadTeamExtras();
      notify('Document ajouté', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible d’ajouter', 'error');
    }
  };

  const removeDocument = async (docId: string) => {
    if (!token) return;
    await deleteEmployeeDocument(token, docId).catch(() => {});
    loadTeamExtras();
  };

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    getUser(token, id)
      .then((user) => {
        setForm({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          address: user.address ?? '',
          role: user.role.toUpperCase(),
          password: '',
        });
        setCoords({ latitude: user.latitude, longitude: user.longitude });
        setAddressSelected(Boolean(user.address));
        setPermissions(user.permissions ?? []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Utilisateur introuvable'))
      .finally(() => setLoading(false));
  }, [token, id]);

  const togglePermission = (value: string) => {
    setPermissions((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));
  };

  const savePermissions = async () => {
    if (!token || !id) return;
    setSavingPermissions(true);
    try {
      await updateUserPermissions(token, id, permissions);
      notify('Permissions mises à jour', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de mettre à jour les permissions';
      notify(message, 'error');
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleChange = (field: keyof CreateUserPayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'address') {
      setAddressError(null);
      setAddressSelected(false);
    }
  };

  useEffect(() => {
    if (!mapboxToken) {
      setAddressSuggestions([]);
      setAddressError('Clé Mapbox absente : définissez VITE_MAPBOX_TOKEN dans web/.env ou .env.local');
      return;
    }
    if (addressSelected) {
      setAddressSuggestions([]);
      return;
    }
    const query = (form.address ?? '').trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setAddressLoading(true);
      setAddressError(null);
      try {
        const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
        url.searchParams.set('access_token', mapboxToken);
        url.searchParams.set('autocomplete', 'true');
        url.searchParams.set('limit', '5');
        url.searchParams.set('country', 'fr');
        const response = await fetch(url.toString(), { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Adresse introuvable');
        }
        const data = await response.json();
        const suggestions: AddressSuggestion[] = (data.features ?? []).map((feature: any) => ({
          id: feature.id,
          label: feature.place_name,
          longitude: feature.center?.[0],
          latitude: feature.center?.[1],
        }));
        setAddressSuggestions(suggestions);
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') return;
        const message = fetchError instanceof Error ? fetchError.message : 'Impossible de récupérer les suggestions.';
        setAddressError(`Erreur récupération adresses : ${message}`);
        setAddressSuggestions([]);
      } finally {
        setAddressLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.address, mapboxToken, addressSelected]);

  const handleAddressSelection = (suggestion: AddressSuggestion) => {
    setForm((prev) => ({ ...prev, address: suggestion.label }));
    setCoords({
      latitude: typeof suggestion.latitude === 'number' ? suggestion.latitude : coords.latitude,
      longitude: typeof suggestion.longitude === 'number' ? suggestion.longitude : coords.longitude,
    });
    setAddressSelected(true);
    setAddressSuggestions([]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const payloadWithCoords = { ...form, latitude: coords.latitude, longitude: coords.longitude };
      if (isEdit && id) {
        const payload: UpdateUserPayload = { ...payloadWithCoords };
        if (!payload.password) delete payload.password;
        await updateUser(token, id, payload);
        notify('Utilisateur mis à jour', 'success');
      } else {
        await createUser(token, payloadWithCoords);
        notify('Utilisateur créé', 'success');
      }
      navigate('/users');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Impossible de sauvegarder';
      setError(message);
      notify(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <span className="pill">Équipes</span>
        <h2>{isEdit ? 'Modifier un utilisateur' : 'Créer un utilisateur'}</h2>
        <p>Gérez les accès et coordonnées des collaborateurs Madypro Clean.</p>
      </div>
      {error && <p className="form-error">{error}</p>}
      <UserForm
        value={form}
        onChange={handleChange}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/users')}
        isEdit={isEdit}
        submitting={loading}
      />

      <article className="settings-card" style={{ marginTop: '1.5rem' }}>
        <span className="card__meta">Localisation</span>
        <h3>Adresse de l'agent</h3>
        <p className="card__meta">
          Utilisée pour suggérer cet agent lors de l'affectation à un gabarit, si aucun pointage récent n'est
          disponible.
        </p>
        <Input
          id="address"
          name="address"
          label="Adresse"
          placeholder="Rue, ville, pays"
          value={form.address ?? ''}
          onChange={(event) => handleChange('address', event.target.value)}
          helperText={mapboxToken ? addressError || (addressLoading ? 'Recherche en cours…' : undefined) : undefined}
        />
        {mapboxToken && addressSuggestions.length > 0 && (
          <div className="address-suggestions">
            {addressSuggestions.map((suggestion) => (
              <button key={suggestion.id} type="button" onClick={() => handleAddressSelection(suggestion)}>
                <strong>{suggestion.label}</strong>
                {(suggestion.latitude !== undefined || suggestion.longitude !== undefined) && (
                  <span>
                    {suggestion.latitude !== undefined && `Lat ${suggestion.latitude.toFixed(4)}`}
                    {suggestion.latitude !== undefined && suggestion.longitude !== undefined && ' · '}
                    {suggestion.longitude !== undefined && `Lon ${suggestion.longitude.toFixed(4)}`}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {addressSelected && (coords.latitude || coords.longitude) && (
          <small className="form-helper">Coordonnées GPS enregistrées automatiquement avec l'adresse choisie.</small>
        )}
      </article>

      {isEdit && form.role !== 'ADMIN' && (
        <article className="settings-card" style={{ marginTop: '1.5rem' }}>
          <span className="card__meta">Accès</span>
          <h3>Permissions granulaires</h3>
          <p className="card__meta">
            Accorde des droits spécifiques au-delà du rôle {form.role === 'SUPERVISOR' ? 'Superviseur' : 'Agent'}.
          </p>
          <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1rem' }}>
            {PERMISSION_OPTIONS.map((option) => (
              <Checkbox
                key={option.value}
                checked={permissions.includes(option.value)}
                onChange={() => togglePermission(option.value)}
                label={option.label}
              />
            ))}
          </div>
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <Button type="button" icon={Save} onClick={savePermissions} loading={savingPermissions}>
              Enregistrer les permissions
            </Button>
          </div>
        </article>
      )}

      {isEdit && (
        <article className="settings-card" style={{ marginTop: '1.5rem' }}>
          <span className="card__meta">RH</span>
          <h3>Habilitations</h3>
          <div className="table-wrapper">
            <table className="table" aria-label="habilitations">
              <thead>
                <tr>
                  <th>Libellé</th>
                  <th>Expiration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {certifications.map((cert) => {
                  const expiringSoon =
                    cert.expiresAt && new Date(cert.expiresAt).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
                  return (
                    <tr key={cert.id}>
                      <td>{cert.label}</td>
                      <td style={expiringSoon ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                        {cert.expiresAt ? cert.expiresAt.slice(0, 10) : '—'}
                      </td>
                      <td>
                        <Button type="button" variant="ghost" icon={Trash2} onClick={() => removeCertification(cert.id)}>
                          Supprimer
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <form className="form-row" onSubmit={submitCertification} style={{ marginTop: '1rem' }}>
            <Input
              label="Libellé"
              value={newCert.label}
              onChange={(event) => setNewCert((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Habilitation électrique"
            />
            <Input
              type="date"
              label="Expiration"
              value={newCert.expiresAt}
              onChange={(event) => setNewCert((prev) => ({ ...prev, expiresAt: event.target.value }))}
            />
            <Button type="submit" icon={Plus}>Ajouter</Button>
          </form>
        </article>
      )}

      {isEdit && (
        <article className="settings-card" style={{ marginTop: '1.5rem' }}>
          <span className="card__meta">RH</span>
          <h3>Documents</h3>
          <div className="table-wrapper">
            <table className="table" aria-label="documents">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Libellé</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      {{ CONTRACT: 'Contrat', BADGE: 'Badge', LICENSE: 'Permis', OTHER: 'Autre' }[doc.type] ?? doc.type}
                    </td>
                    <td>{doc.label}</td>
                    <td>
                      <Button type="button" variant="ghost" icon={Trash2} onClick={() => removeDocument(doc.id)}>
                        Supprimer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form className="form-row" onSubmit={submitDocument} style={{ marginTop: '1rem' }}>
            <Select
              label="Type"
              value={newDoc.type}
              onChange={(event) => setNewDoc((prev) => ({ ...prev, type: event.target.value }))}
              options={[
                { value: 'CONTRACT', label: 'Contrat' },
                { value: 'BADGE', label: 'Badge' },
                { value: 'LICENSE', label: 'Permis' },
                { value: 'OTHER', label: 'Autre' },
              ]}
            />
            <Input
              label="Libellé"
              value={newDoc.label}
              onChange={(event) => setNewDoc((prev) => ({ ...prev, label: event.target.value }))}
            />
            <label className="form-field">
              <span>Fichier</span>
              <input
                type="file"
                onChange={(event) => setNewDoc((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))}
              />
            </label>
            <Button type="submit" icon={Plus}>Ajouter</Button>
          </form>
        </article>
      )}
    </div>
  );
};
