import React, { useEffect, useState } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import {
  updateIntervention,
  setClientSignature,
} from '../../services/api/interventions.api';
import { listAttendance, updateAttendance as updateAttendanceApi } from '../../services/api/attendance.api';
import { Intervention } from '../../types/intervention';
import { Attendance } from '../../types/attendance';
import { isApprovalRequest } from '../../types/approval';
import { compressImageFile } from '../../utils/image';
import { formatHour, timeValue } from '../../utils/datetime';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { ChipGroup } from '../ui/ChipGroup';
import { Modal, ModalHeader, ModalBody } from '../ui/Modal';
import { RichTextEditor } from '../ui/RichTextEditor';
import { PhotoGrid } from '../ui/PhotoGrid';
import { interventionStatusLabel } from '../ui/StatusChip';

const TERMINAL_STATUSES = ['COMPLETED', 'NO_SHOW', 'CANCELLED'];

export type InterventionViewModalProps = {
  viewing: Intervention | null;
  onClose: () => void;
  agentOptions: { id: string; name: string }[];
  /** Appelé après chaque sauvegarde réussie (facturable, agents, pointages, observation/photos, signature). */
  onUpdated: (updated: Intervention) => void;
};

export const InterventionViewModal: React.FC<InterventionViewModalProps> = ({
  viewing,
  onClose,
  agentOptions,
  onUpdated,
}) => {
  const { token, notify } = useAuthContext();
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [attendanceEdits, setAttendanceEdits] = useState<Record<string, { checkInTime?: string; checkOutTime?: string }>>({});
  const [agentSelection, setAgentSelection] = useState<string[]>([]);
  const [observationDraft, setObservationDraft] = useState('');
  const [photoDraft, setPhotoDraft] = useState<string[]>([]);
  const [savingAgents, setSavingAgents] = useState(false);
  const [savingObservation, setSavingObservation] = useState(false);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const fetchAttendance = (current: Intervention) => {
    if (!token) return;
    listAttendance(token, {
      siteId: current.siteId,
      startDate: current.date,
      endDate: current.date,
      status: 'all',
      pageSize: 200,
    })
      .then((res) => setAttendances((res as any)?.items ?? (Array.isArray(res) ? res : [])))
      .catch(() => setAttendances([]));
  };

  useEffect(() => {
    if (!viewing) return;
    setObservationDraft(viewing.observation ?? '');
    setPhotoDraft(viewing.photos ?? []);
    setAgentSelection(viewing.agentIds ?? []);
    setAttendanceEdits({});
    fetchAttendance(viewing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.id, token]);

  useEffect(() => {
    if (!viewing) return;
    const id = setInterval(() => fetchAttendance(viewing), 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewing?.id, token]);

  if (!viewing) {
    return null;
  }

  const attendanceByAgentId = new Map<string, Attendance>();
  attendances
    .filter((att) => att.interventionId === viewing.id)
    .forEach((att) => {
      if (!attendanceByAgentId.has(att.agent.id)) attendanceByAgentId.set(att.agent.id, att);
    });

  const applyResult = (result: Intervention | Awaited<ReturnType<typeof updateIntervention>>, successMessage: string) => {
    if (isApprovalRequest(result)) {
      notify('Demande envoyée pour validation admin');
      return;
    }
    onUpdated(result);
    notify(successMessage);
  };

  const handleUpdateBillable = async () => {
    if (!token) return;
    try {
      const result = await updateIntervention(token, viewing.id, { billable: !viewing.billable });
      applyResult(result, 'Facturation mise à jour');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Mise à jour impossible', 'error');
    }
  };

  const handleSaveAgents = async () => {
    if (!token) return;
    setSavingAgents(true);
    try {
      const result = await updateIntervention(token, viewing.id, { agentIds: agentSelection });
      applyResult(result, 'Agents mis à jour');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Mise à jour impossible', 'error');
    } finally {
      setSavingAgents(false);
    }
  };

  const handleSaveAttendanceCorrections = async () => {
    if (!token) return;
    const entries = Object.entries(attendanceEdits).filter(([, edit]) => edit.checkInTime || edit.checkOutTime);
    if (!entries.length) {
      notify('Aucune modification détectée', 'info');
      return;
    }
    try {
      for (const [attId, edit] of entries) {
        await updateAttendanceApi(token, attId, { checkInTime: edit.checkInTime, checkOutTime: edit.checkOutTime });
      }
      setAttendanceEdits({});
      fetchAttendance(viewing);
      notify('Corrections enregistrées');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible d’enregistrer les corrections', 'error');
    }
  };

  const handlePhotoUpload = (files: FileList | null) => {
    if (!files || !files.length) return;
    Promise.all(Array.from(files).map((file) => compressImageFile(file)))
      .then((base64) => setPhotoDraft((prev) => [...prev, ...base64]))
      .catch(() => notify('Impossible de charger les photos', 'error'));
  };

  const handleSaveObservationPhotos = async () => {
    if (!token) return;
    setSavingObservation(true);
    try {
      const result = await updateIntervention(token, viewing.id, { observation: observationDraft, photos: photoDraft });
      applyResult(result, 'Observation mise à jour');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Impossible de sauvegarder', 'error');
    } finally {
      setSavingObservation(false);
    }
  };

  const handleSignatureUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      if (!token) return;
      const dataUrl = reader.result as string;
      setSignatureUploading(true);
      try {
        await setClientSignature(token, viewing.id, dataUrl);
        onUpdated({ ...viewing, clientSignature: dataUrl });
        notify('Signature enregistrée');
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Envoi impossible', 'error');
      } finally {
        setSignatureUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const isTerminal = TERMINAL_STATUSES.includes(viewing.status);

  return (
    <>
    <Modal open={Boolean(viewing)} onClose={onClose} maxWidth={800} labelledBy="intervention-view-title">
      <ModalHeader
        eyebrow="Intervention"
        title={
          <>
            {viewing.siteName}
            <br />
            <small style={{ color: 'var(--color-muted)', textTransform: 'none', letterSpacing: 'normal' }}>
              {viewing.date} · {viewing.startTime} - {viewing.endTime}
            </small>
          </>
        }
        titleId="intervention-view-title"
        onClose={onClose}
      />
      <ModalBody>
        <div className="detail-grid" style={{ marginTop: 0 }}>
          <div>
            <strong>Site</strong>
            <p>{viewing.siteName}</p>
          </div>
          <div>
            <strong>Type</strong>
            <p>{viewing.type === 'REGULAR' ? 'Régulier' : `Ponctuel - ${viewing.subType ?? 'Sans sous-type'}`}</p>
          </div>
          <div>
            <strong>Agents</strong>
            <p>{viewing.agents.map((a) => a.name).join(', ') || '—'}</p>
          </div>
          <div>
            <strong>Camions</strong>
            <p>{viewing.truckLabels.join(', ') || '—'}</p>
          </div>
          <div>
            <strong>Statut</strong>
            <p>{interventionStatusLabel(viewing.status)}</p>
          </div>
          <div>
            <strong>Facturable</strong>
            <Checkbox checked={viewing.billable} label={viewing.billable ? 'Oui' : 'Non (interne)'} onChange={handleUpdateBillable} />
          </div>
          <div>
            <strong>Observation</strong>
            <p>{viewing.observation || '—'}</p>
          </div>
        </div>

        {!['COMPLETED', 'CANCELLED'].includes(viewing.status) && (
          <div style={{ marginTop: '1.5rem' }}>
            <h4>Agents assignés</h4>
            <ChipGroup
              multiple
              options={agentOptions.map((agent) => ({ value: agent.id, label: agent.name }))}
              value={agentSelection}
              onChange={setAgentSelection}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <Button type="button" variant="ghost" className="btn--compact" disabled={savingAgents} onClick={handleSaveAgents}>
                {savingAgents ? 'Enregistrement...' : 'Mettre à jour les agents'}
              </Button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '1.5rem' }}>
          <h4>Agents & pointages</h4>
          <div className="table-wrapper" style={{ maxHeight: 240, overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Arrivée</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Photos</th>
                </tr>
              </thead>
              <tbody>
                {viewing.agents.map((agent) => {
                  const fallback = attendanceByAgentId.get(agent.id);
                  const attendanceId = agent.attendanceId ?? fallback?.id;
                  const arrival = formatHour(agent.arrivalTime);
                  const startValue = attendanceEdits[attendanceId ?? '']?.checkInTime ?? timeValue(agent.checkInTime ?? fallback?.checkInTime);
                  const endValue = attendanceEdits[attendanceId ?? '']?.checkOutTime ?? timeValue(agent.checkOutTime ?? fallback?.checkOutTime);
                  return (
                    <tr key={agent.id}>
                      <td>{agent.name}</td>
                      <td>{arrival}</td>
                      <td>
                        {viewing.status === 'NEEDS_REVIEW' && attendanceId ? (
                          <input
                            type="time"
                            value={startValue}
                            onChange={(e) =>
                              setAttendanceEdits((prev) => ({ ...prev, [attendanceId]: { ...prev[attendanceId], checkInTime: e.target.value } }))
                            }
                          />
                        ) : (
                          formatHour(agent.checkInTime ?? fallback?.checkInTime)
                        )}
                      </td>
                      <td>
                        {viewing.status === 'NEEDS_REVIEW' && attendanceId ? (
                          <input
                            type="time"
                            value={endValue}
                            onChange={(e) =>
                              setAttendanceEdits((prev) => ({ ...prev, [attendanceId]: { ...prev[attendanceId], checkOutTime: e.target.value } }))
                            }
                          />
                        ) : (
                          formatHour(agent.checkOutTime ?? fallback?.checkOutTime)
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          {fallback?.checkInPhoto && (
                            <img
                              src={fallback.checkInPhoto}
                              alt="Photo arrivée"
                              title="Photo arrivée — cliquer pour agrandir"
                              onClick={() => setLightboxSrc(fallback.checkInPhoto!)}
                              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                            />
                          )}
                          {fallback?.checkOutPhoto && (
                            <img
                              src={fallback.checkOutPhoto}
                              alt="Photo départ"
                              title="Photo départ — cliquer pour agrandir"
                              onClick={() => setLightboxSrc(fallback.checkOutPhoto!)}
                              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                            />
                          )}
                          {!fallback?.checkInPhoto && !fallback?.checkOutPhoto && (
                            <span style={{ color: 'var(--color-muted)' }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!viewing.agents.length && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
                      Aucun agent associé
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {viewing.status === 'NEEDS_REVIEW' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <Button type="button" variant="ghost" onClick={() => setAttendanceEdits({})}>
                Réinitialiser
              </Button>
              <Button type="button" onClick={handleSaveAttendanceCorrections}>
                Enregistrer corrections
              </Button>
            </div>
          )}
        </div>

        {viewing.status === 'NEEDS_REVIEW' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem' }}>
            <small style={{ color: 'var(--color-muted)' }}>Seul le superviseur peut valider cette intervention.</small>
            <Button type="button" variant="ghost" onClick={onClose}>
              Fermer
            </Button>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'grid', gap: '1rem' }}>
          {isTerminal ? (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <h4>Observation superviseur / admin</h4>
              <RichTextEditor value={observationDraft} onChange={setObservationDraft} placeholder="Ajouter une observation" />
              <div style={{ display: 'grid', gap: '0.35rem' }}>
                <p className="card__meta">Photos</p>
                <PhotoGrid
                  images={photoDraft}
                  onAdd={handlePhotoUpload}
                  onRemove={(index) => setPhotoDraft((prev) => prev.filter((_, i) => i !== index))}
                />
              </div>
              {viewing.status === 'COMPLETED' && (
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <p className="card__meta">Signature client</p>
                  {viewing.clientSignature && (
                    <img
                      src={viewing.clientSignature}
                      alt="Signature client"
                      style={{ maxWidth: '240px', border: '1px solid #eef1f4', borderRadius: '8px' }}
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={signatureUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSignatureUpload(file);
                    }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Fermer
                </Button>
                <Button type="button" onClick={handleSaveObservationPhotos} disabled={savingObservation}>
                  {savingObservation ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {photoDraft.length > 0 ? (
                <div style={{ flex: 1 }}>
                  <h4 style={{ marginBottom: '0.5rem' }}>Photos</h4>
                  <PhotoGrid images={photoDraft} onAdd={() => {}} onRemove={() => {}} disabled />
                </div>
              ) : (
                <div />
              )}
              <Button type="button" variant="ghost" onClick={onClose}>
                Fermer
              </Button>
            </div>
          )}
        </div>
      </ModalBody>
    </Modal>
    <Modal open={Boolean(lightboxSrc)} onClose={() => setLightboxSrc(null)} maxWidth={640} labelledBy="attendance-photo-title">
      <ModalHeader eyebrow="Pointage" title="Photo" titleId="attendance-photo-title" onClose={() => setLightboxSrc(null)} />
      <ModalBody>
        {lightboxSrc && (
          <img src={lightboxSrc} alt="Photo de pointage" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
        )}
      </ModalBody>
    </Modal>
    </>
  );
};
