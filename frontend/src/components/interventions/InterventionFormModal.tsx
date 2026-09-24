import React from 'react';
import { CreateInterventionPayload } from '../../services/api/interventions.api';
import { AssignmentSuggestion, DurationEstimate } from '../../types/intervention';
import { SiteCategory } from '../../types/category';
import { Site } from '../../types/site';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { ChipGroup } from '../ui/ChipGroup';
import { Modal, ModalHeader, ModalBody } from '../ui/Modal';
import { RichTextEditor } from '../ui/RichTextEditor';

const TRUCK_OPTIONS = ['Camion (Drissa)', 'Camion (Cissé)', 'Camion (Samassa)'];

export type InterventionFormModalProps = {
  open: boolean;
  onClose: () => void;
  editingId: string | null;
  observationOnly?: boolean;
  submitting: boolean;
  sites: Site[];
  agentOptions: { id: string; name: string }[];
  siteCategoriesBySite: Record<string, SiteCategory[]>;
  form: CreateInterventionPayload;
  setForm: React.Dispatch<React.SetStateAction<CreateInterventionPayload>>;
  onSiteChange: (siteId: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onReset?: () => void;
  durationEstimate?: DurationEstimate | null;
  suggestions?: AssignmentSuggestion | null;
  suggestionsLoading?: boolean;
  onFetchSuggestions?: () => void;
  onAddSuggestedAgent?: (agentId: string) => void;
};

export const InterventionFormModal: React.FC<InterventionFormModalProps> = ({
  open,
  onClose,
  editingId,
  observationOnly,
  submitting,
  sites,
  agentOptions,
  siteCategoriesBySite,
  form,
  setForm,
  onSiteChange,
  onSubmit,
  onReset,
  durationEstimate,
  suggestions,
  suggestionsLoading,
  onFetchSuggestions,
  onAddSuggestedAgent,
}) => {
  const applyCategoryToForm = (categoryId: string) => {
    const sc = (siteCategoriesBySite[form.siteId] ?? []).find((c) => c.categoryId === categoryId);
    setForm((prev) => ({
      ...prev,
      categoryId,
      subType: sc?.category.label,
      ...(sc ? { startTime: sc.startTime, endTime: sc.endTime } : {}),
    }));
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={960} labelledBy="intervention-form-title">
      <ModalHeader
        eyebrow="Intervention"
        title={editingId ? 'Modifier une intervention' : 'Nouvelle intervention'}
        titleId="intervention-form-title"
        onClose={onClose}
        actions={
          onReset ? (
            <Button type="button" variant="ghost" onClick={onReset}>
              Réinitialiser
            </Button>
          ) : undefined
        }
      />
      <ModalBody>
        <form
          className="form-card"
          onSubmit={onSubmit}
          style={{ boxShadow: 'none', padding: 0, display: 'grid', gap: '1rem' }}
        >
          <Select
            label="Type"
            options={[
              { value: 'REGULAR', label: 'Régulier' },
              { value: 'PONCTUAL', label: 'Ponctuel' },
            ]}
            value={form.type}
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as CreateInterventionPayload['type'] }))}
            disabled={observationOnly}
          />
          <Select
            label="Site"
            options={sites.map((site) => ({ value: site.id, label: site.name }))}
            value={form.siteId}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, siteId: e.target.value }));
              onSiteChange(e.target.value);
            }}
            disabled={observationOnly}
          />
          <Select
            label="Catégorie"
            options={[
              { value: '', label: form.type === 'PONCTUAL' ? 'Sélectionner (obligatoire)' : 'Aucune / personnalisé' },
              ...(siteCategoriesBySite[form.siteId] ?? []).map((sc) => ({ value: sc.categoryId, label: sc.category.label })),
            ]}
            value={form.categoryId ?? ''}
            onChange={(e) => applyCategoryToForm(e.target.value)}
            disabled={observationOnly}
          />
          {form.type === 'PONCTUAL' && !form.categoryId && (
            <Input
              label="Sous-type (si aucune catégorie ne convient)"
              value={form.subType ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, subType: e.target.value }))}
              disabled={observationOnly}
            />
          )}
          <Input
            label="Libellé"
            value={form.label ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="Nettoyage du site – matin"
            disabled={observationOnly}
          />
          <div className="form-row">
            <Input
              label="Date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              disabled={observationOnly}
            />
            <Input
              label="Début"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
              disabled={observationOnly}
            />
            <Input
              label="Fin"
              type="time"
              value={form.endTime}
              onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
              disabled={observationOnly}
            />
          </div>
          {durationEstimate?.estimatedMinutes != null && (
            <small className="form-helper">
              Durée moyenne historique sur ce site : {durationEstimate.estimatedMinutes} min (sur {durationEstimate.sampleSize} interventions)
            </small>
          )}
          <ChipGroup
            multiple
            label="Agents"
            options={agentOptions.map((agent) => ({ value: agent.id, label: agent.name, disabled: observationOnly }))}
            value={form.agentIds}
            onChange={(agentIds) => setForm((prev) => ({ ...prev, agentIds }))}
          />
          {editingId && !observationOnly && onFetchSuggestions && (
            <div className="form-field">
              <Button type="button" variant="ghost" onClick={onFetchSuggestions} disabled={suggestionsLoading}>
                {suggestionsLoading ? 'Recherche...' : 'Suggérer un agent'}
              </Button>
              {suggestions && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
                  {suggestions.candidates.length === 0 && <small className="form-helper">Aucun candidat disponible.</small>}
                  {suggestions.candidates.map((candidate) => (
                    <div key={candidate.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                      <span>
                        {candidate.name}
                        {candidate.distanceMeters != null ? ` · ${(candidate.distanceMeters / 1000).toFixed(1)} km` : ''}
                      </span>
                      <Button type="button" variant="ghost" className="btn--compact" onClick={() => onAddSuggestedAgent?.(candidate.id)}>
                        Ajouter
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {form.type === 'PONCTUAL' && (
            <ChipGroup
              multiple
              label="Camions"
              options={TRUCK_OPTIONS.map((truck) => ({ value: truck, label: truck, disabled: observationOnly }))}
              value={form.truckLabels ?? []}
              onChange={(truckLabels) => setForm((prev) => ({ ...prev, truckLabels }))}
            />
          )}
          <label className="form-field" htmlFor="observation">
            <span>Observation admin / superviseur</span>
            <RichTextEditor
              value={form.observation ?? ''}
              onChange={(value) => setForm((prev) => ({ ...prev, observation: value }))}
              disabled={observationOnly}
              placeholder="Instruction ou remarque"
            />
          </label>
          <div className="form-actions" style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Enregistrement...' : editingId ? 'Mettre à jour' : 'Enregistrer'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
};
