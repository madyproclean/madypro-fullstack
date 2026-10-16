import React, { useEffect, useState } from 'react';
import { Check, Copy, Trash2 } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import {
  addTemplatePause,
  deleteTemplatePause,
  duplicateTemplate,
  listTemplatePauses,
  TemplatePause,
} from '../../services/api/interventions.api';
import { InterventionTemplate } from '../../types/intervention';
import { Modal, ModalBody, ModalHeader } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

type PausesProps = { template: InterventionTemplate | null; onClose: () => void };

/** Fermetures d'un site (vacances, travaux) : aucun passage n'est prévu sur ces périodes. */
export const TemplatePausesModal: React.FC<PausesProps> = ({ template, onClose }) => {
  const { token, user, notify } = useAuthContext();
  const [items, setItems] = useState<TemplatePause[]>([]);
  const [form, setForm] = useState({ from: '', to: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  const load = () => {
    if (!token || !template) return;
    listTemplatePauses(token, template.id).then(setItems).catch(() => setItems([]));
  };
  useEffect(() => {
    setForm({ from: '', to: '', reason: '' });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const add = async () => {
    if (!token || !template) return;
    setSaving(true);
    try {
      const result = await addTemplatePause(token, template.id, { ...form, reason: form.reason.trim() || undefined });
      notify(`Fermeture enregistrée${result.cancelledMissions ? ` : ${result.cancelledMissions} mission(s) déjà créée(s) annulée(s)` : ''}`);
      setForm({ from: '', to: '', reason: '' });
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Enregistrement impossible', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (pause: TemplatePause) => {
    if (!token || !template) return;
    try {
      await deleteTemplatePause(token, template.id, pause.id);
      notify('Fermeture retirée : les passages reprennent');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error');
    }
  };

  return (
    <Modal open={Boolean(template)} onClose={onClose} maxWidth={680} labelledBy="gabarit-pauses-title">
      <ModalHeader eyebrow="Fermetures du site" title={template?.label ?? ''} titleId="gabarit-pauses-title" onClose={onClose} />
      <ModalBody>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>
            Pendant une fermeture (congés du restaurant, travaux), aucun passage n’est prévu. Le gabarit reprend tout seul à la fin.
          </p>
          {isAdmin ? (
            <>
              <div className="form-row">
                <Input label="Du" type="date" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} />
                <Input label="Au" type="date" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} />
              </div>
              <Input
                label="Motif (facultatif)"
                placeholder="Ex. : fermeture annuelle"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
              <div className="form-actions">
                <Button type="button" icon={Check} loading={saving} disabled={!form.from || !form.to} onClick={add}>
                  Ajouter la fermeture
                </Button>
              </div>
            </>
          ) : (
            <p className="card__meta">Seul l’administrateur peut ajouter une fermeture ; pour un seul jour, utilisez « Changer un jour ».</p>
          )}
          {items.length === 0 && <p className="card__meta">Aucune fermeture prévue.</p>}
          {items.map((p) => (
            <div key={p.id} className="panel" style={{ padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Du {new Date(`${p.from}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} au{' '}
                {new Date(`${p.to}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}
                {p.reason ? ` · ${p.reason}` : ''}
              </span>
              {isAdmin && (
                <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => remove(p)}>
                  Retirer
                </Button>
              )}
            </div>
          ))}
        </div>
      </ModalBody>
    </Modal>
  );
};

type CopyProps = {
  template: InterventionTemplate | null;
  siteOptions: { value: string; label: string }[];
  onClose: () => void;
  onCopied: () => void;
};

/** Copie les créneaux vers un site qui n'a pas encore de gabarit (agents à choisir ensuite). */
export const TemplateCopyModal: React.FC<CopyProps> = ({ template, siteOptions, onClose, onCopied }) => {
  const { token, notify } = useAuthContext();
  const [siteId, setSiteId] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setSiteId(''), [template]);

  const copy = async () => {
    if (!token || !template || !siteId) return;
    setSaving(true);
    try {
      const created = await duplicateTemplate(token, template.id, siteId);
      notify(created.validatedAt ? 'Gabarit copié : ajoutez les agents' : 'Gabarit copié, en attente de validation : ajoutez les agents');
      onCopied();
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Copie impossible', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(template)} onClose={onClose} maxWidth={560} labelledBy="gabarit-copy-title">
      <ModalHeader eyebrow="Copier le gabarit" title={template?.label ?? ''} titleId="gabarit-copy-title" onClose={onClose} />
      <ModalBody>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>
            Les jours et horaires sont repris ; les agents ne sont pas copiés (ils ne peuvent pas être à deux endroits à la fois).
          </p>
          <Select label="Site de destination" options={[{ value: '', label: 'Choisir un site sans gabarit' }, ...siteOptions]} value={siteId} onChange={(e) => setSiteId(e.target.value)} />
          <div className="form-actions">
            <Button type="button" icon={Copy} loading={saving} disabled={!siteId} onClick={copy}>
              Copier
            </Button>
          </div>
        </div>
      </ModalBody>
    </Modal>
  );
};
