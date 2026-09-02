import React, { useEffect, useState } from 'react';
import { Plus, Eye, Archive } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { CustomForm, CustomFormSubmission, FormField, FormFieldType } from '../../types/form';
import { listForms, createForm, archiveForm, listFormSubmissions } from '../../services/api/forms.api';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Modal, ModalHeader, ModalBody } from '../../components/ui/Modal';
import { RepeatableFieldArray } from '../../components/ui/RepeatableFieldArray';
import { formatDateTime } from '../../utils/datetime';

const FIELD_TYPE_OPTIONS: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Oui/Non' },
  { value: 'textarea', label: 'Texte long' },
];

const emptyField = (): FormField => ({ key: '', label: '', type: 'text', required: false });

export const FormsPage: React.FC = () => {
  const { token, notify } = useAuthContext();
  const [forms, setForms] = useState<CustomForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [name, setName] = useState('');
  const [fields, setFields] = useState<FormField[]>([emptyField()]);
  const [creating, setCreating] = useState(false);
  const [viewingSubmissions, setViewingSubmissions] = useState<CustomForm | null>(null);
  const [submissions, setSubmissions] = useState<CustomFormSubmission[]>([]);

  const load = () => {
    if (!token) return;
    setLoading(true);
    listForms(token)
      .then(setForms)
      .catch((err) => notify(err instanceof Error ? err.message : 'Impossible de charger les formulaires', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const updateField = (index: number, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };

  const removeField = (index: number) => {
    setFields((prev) => {
      if (prev.length <= 1) {
        notify('Un formulaire doit conserver au moins un champ', 'error');
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !name.trim() || !fields.length || fields.some((f) => !f.key.trim() || !f.label.trim())) {
      notify('Nom du formulaire et clé/libellé pour chaque champ requis', 'error');
      return;
    }
    setCreating(true);
    try {
      await createForm(token, name.trim(), fields);
      notify('Formulaire créé');
      setName('');
      setFields([emptyField()]);
      setFormVisible(false);
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Création impossible', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (form: CustomForm) => {
    if (!token) return;
    try {
      await archiveForm(token, form.id);
      notify('Formulaire archivé');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Archivage impossible', 'error');
    }
  };

  const openSubmissions = async (form: CustomForm) => {
    if (!token) return;
    setViewingSubmissions(form);
    try {
      const data = await listFormSubmissions(token, form.id);
      setSubmissions(data);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de charger les soumissions', 'error');
      setSubmissions([]);
    }
  };

  return (
    <div>
      <div className="page-header">
        <span className="pill">Formulaires</span>
        <h2>Formulaires personnalisables</h2>
        <p>Construisez des formulaires terrain (checklists, rapports) remplis depuis mobile ou un lien partagé.</p>
        <Button type="button" icon={Plus} onClick={() => setFormVisible((v) => !v)}>
          {formVisible ? 'Fermer' : 'Nouveau formulaire'}
        </Button>
      </div>

      {formVisible && (
        <form className="form-card" onSubmit={handleCreate} style={{ marginBottom: '1.5rem' }}>
          <Input id="formName" label="Nom du formulaire" value={name} onChange={(event) => setName(event.target.value)} />
          <div className="form-field">
            <span>Champs</span>
            <div style={{ marginTop: '0.5rem' }}>
              <RepeatableFieldArray
                items={fields}
                onAdd={() => setFields((prev) => [...prev, emptyField()])}
                onRemove={removeField}
                addLabel="Ajouter un champ"
                renderItem={(field, index) => (
                  <div className="form-row">
                    <Input
                      label="Clé"
                      placeholder="niveau_proprete"
                      value={field.key}
                      onChange={(event) => updateField(index, { key: event.target.value })}
                    />
                    <Input
                      label="Libellé"
                      placeholder="Niveau de propreté"
                      value={field.label}
                      onChange={(event) => updateField(index, { label: event.target.value })}
                    />
                    <Select
                      label="Type"
                      options={FIELD_TYPE_OPTIONS}
                      value={field.type}
                      onChange={(event) => updateField(index, { type: event.target.value as FormFieldType })}
                    />
                    <Checkbox
                      checked={field.required ?? false}
                      onChange={(checked) => updateField(index, { required: checked })}
                      label="Obligatoire"
                    />
                  </div>
                )}
              />
            </div>
          </div>
          <div className="form-actions">
            <Button type="submit" icon={Plus} loading={creating}>
              Créer le formulaire
            </Button>
          </div>
        </form>
      )}

      <section className="panel">
        <h3>Formulaires actifs</h3>
        {loading ? (
          <p>Chargement...</p>
        ) : forms.length === 0 ? (
          <p className="card__meta">Aucun formulaire.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table" aria-label="formulaires">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Champs</th>
                  <th>Créé le</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id}>
                    <td>{form.name}</td>
                    <td>{form.fields.map((f) => f.label).join(', ')}</td>
                    <td>{formatDateTime(form.createdAt)}</td>
                    <td>
                      <div className="table-actions">
                        <Button type="button" variant="ghost" className="btn--compact" icon={Eye} onClick={() => openSubmissions(form)}>
                          Soumissions
                        </Button>
                        <Button type="button" variant="ghost" className="btn--compact" icon={Archive} onClick={() => handleArchive(form)}>
                          Archiver
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={viewingSubmissions !== null} onClose={() => setViewingSubmissions(null)} maxWidth={800} labelledBy="form-submissions-title">
        <ModalHeader
          title={`Soumissions — ${viewingSubmissions?.name ?? ''}`}
          titleId="form-submissions-title"
          onClose={() => setViewingSubmissions(null)}
        />
        <ModalBody>
            {submissions.length === 0 ? (
              <p className="card__meta">Aucune soumission pour ce formulaire.</p>
            ) : (
              <ul className="list-line">
                {submissions.map((submission) => (
                  <li key={submission.id} style={{ display: 'block' }}>
                    <strong>{formatDateTime(submission.createdAt)}</strong>
                    <pre style={{ whiteSpace: 'pre-wrap', margin: '0.25rem 0 0' }}>{JSON.stringify(submission.data, null, 2)}</pre>
                  </li>
                ))}
              </ul>
            )}
        </ModalBody>
      </Modal>
    </div>
  );
};
