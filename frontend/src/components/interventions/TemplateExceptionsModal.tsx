import React, { useEffect, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { createTemplateException, deleteTemplateException, listTemplateExceptions } from '../../services/api/interventions.api';
import { InterventionTemplate, TemplateException } from '../../types/intervention';
import { isApprovalRequest } from '../../types/approval';
import { Modal, ModalBody, ModalHeader } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { ChipGroup } from '../ui/ChipGroup';

const DAY_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const todayParis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

type Props = {
  template: InterventionTemplate | null;
  agentOptions: { id: string; name: string }[];
  onClose: () => void;
};

/**
 * Changements d'un seul jour sur un créneau du gabarit : remplacer un agent absent ou annuler ce
 * jour-là. Le gabarit lui-même ne change pas.
 */
export const TemplateExceptionsModal: React.FC<Props> = ({ template, agentOptions, onClose }) => {
  const { token, user, notify } = useAuthContext();
  const [items, setItems] = useState<TemplateException[]>([]);
  const [stopId, setStopId] = useState('');
  const [date, setDate] = useState(todayParis());
  const [kind, setKind] = useState<'REPLACE_AGENTS' | 'CANCEL'>('REPLACE_AGENTS');
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!token || !template) return;
    listTemplateExceptions(token, template.id)
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => {
    if (!template) return;
    setStopId(template.stops[0]?.id ?? '');
    setAgentIds([]);
    setReason('');
    setKind('REPLACE_AGENTS');
    setDate(todayParis());
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const stopLabel = (id: string) => {
    const stop = template?.stops.find((s) => s.id === id);
    if (!stop) return 'Créneau supprimé';
    const days = stop.specificDate ? `le ${stop.specificDate.slice(0, 10)}` : stop.daysOfWeek.map((d) => DAY_SHORT[d]).join(', ');
    return `${days} · ${stop.startTime}–${stop.endTime}`;
  };

  const submit = async () => {
    if (!token || !template) return;
    setSaving(true);
    try {
      const result = await createTemplateException(token, template.id, {
        stopId,
        date,
        kind,
        agentIds: kind === 'REPLACE_AGENTS' ? agentIds : undefined,
        reason: reason.trim() || undefined,
      });
      notify(
        isApprovalRequest(result)
          ? 'Demande d’annulation envoyée à l’administrateur'
          : kind === 'CANCEL'
          ? 'Créneau annulé ce jour-là'
          : 'Remplacement enregistré pour ce jour-là',
      );
      setAgentIds([]);
      setReason('');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Enregistrement impossible', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (exception: TemplateException) => {
    if (!token || !template) return;
    try {
      await deleteTemplateException(token, template.id, exception.id);
      notify('Retour au gabarit habituel pour ce jour-là');
      load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Suppression impossible', 'error');
    }
  };

  const invalid = !stopId || !date || (kind === 'REPLACE_AGENTS' ? !agentIds.length : !reason.trim());

  return (
    <Modal open={Boolean(template)} onClose={onClose} maxWidth={760} labelledBy="gabarit-exceptions-title">
      <ModalHeader eyebrow="Changement d’un jour" title={template?.label ?? ''} titleId="gabarit-exceptions-title" onClose={onClose} />
      <ModalBody>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <p style={{ margin: 0, color: 'var(--color-muted)' }}>
            Pour un seul jour : remplacer un agent (absence, échange) ou annuler le passage (site fermé). Le gabarit reste inchangé
            les autres jours.
            {user?.role !== 'ADMIN' && ' Une annulation est envoyée à l’administrateur pour accord.'}
          </p>
          <div className="form-row">
            <Select
              label="Créneau"
              options={(template?.stops ?? []).map((s) => ({ value: s.id, label: stopLabel(s.id) }))}
              value={stopId}
              onChange={(e) => setStopId(e.target.value)}
            />
            <Input label="Jour" type="date" min={todayParis()} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <ChipGroup
            label="Changement"
            options={[
              { value: 'REPLACE_AGENTS', label: 'Remplacer les agents' },
              { value: 'CANCEL', label: 'Annuler ce jour-là' },
            ]}
            value={kind}
            onChange={(value) => setKind(value as 'REPLACE_AGENTS' | 'CANCEL')}
          />
          {kind === 'REPLACE_AGENTS' && (
            <ChipGroup
              multiple
              label="Agents prévus ce jour-là"
              options={agentOptions.map((a) => ({ value: a.id, label: a.name }))}
              value={agentIds}
              onChange={setAgentIds}
            />
          )}
          <Input
            label={kind === 'CANCEL' ? 'Motif (obligatoire)' : 'Motif (facultatif)'}
            value={reason}
            placeholder={kind === 'CANCEL' ? 'Ex. : restaurant fermé pour travaux' : 'Ex. : arrêt maladie de l’agent habituel'}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="form-actions">
            <Button type="button" icon={Check} loading={saving} disabled={invalid} onClick={submit}>
              Enregistrer
            </Button>
          </div>

          <h3 style={{ margin: '0.5rem 0 0' }}>Changements à venir</h3>
          {items.length === 0 && <p style={{ margin: 0, color: 'var(--color-muted)' }}>Aucun.</p>}
          {items.map((item) => (
            <div key={item.id} className="panel" style={{ padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
              <div>
                <strong>{dayLabel(item.date)}</strong> · {stopLabel(item.stopId)}
                <div style={{ fontSize: '0.85rem' }}>
                  {item.kind === 'CANCEL' ? 'Annulé' : `Remplacé par ${item.agents.map((a) => a.name).join(', ')}`}
                  {item.reason ? ` · ${item.reason}` : ''}
                  {item.createdByName ? ` · par ${item.createdByName}` : ''}
                </div>
              </div>
              <Button type="button" variant="ghost" className="btn--compact" icon={Trash2} onClick={() => remove(item)}>
                Retirer
              </Button>
            </div>
          ))}
        </div>
      </ModalBody>
    </Modal>
  );
};
