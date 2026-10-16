import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { MissionDetail } from '../MissionDetail';
import { fetchInterventionById, updateInterventionStatus } from '@/services/api/interventions.api';
import { ApiError } from '@/services/api/client';
import { Intervention } from '@/types/intervention';

jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ token: 't', user: { id: 'sup-1' } }) }));
jest.mock('@/context/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/services/api/interventions.api', () => ({
  fetchInterventionById: jest.fn(),
  updateInterventionStatus: jest.fn(),
  listInterventionChecklist: jest.fn().mockResolvedValue([]),
}));
jest.mock('@/services/api/anomalies.api', () => ({
  listAnomalies: jest.fn().mockResolvedValue([]),
  updateAnomalyStatus: jest.fn(),
}));
jest.mock('@/services/api/supervision.api', () => ({
  listMissionAttendance: jest.fn().mockResolvedValue([]),
  listMyRequests: jest.fn().mockResolvedValue([]),
}));

const mission = (over: Partial<Intervention> = {}): Intervention => ({
  id: 'int-1',
  siteId: 'site-a',
  siteName: 'Résidence des Acacias',
  date: '2026-10-13',
  startTime: '08:00',
  endTime: '11:00',
  type: 'REGULAR',
  status: 'NEEDS_REVIEW',
  agentIds: ['agent-1'],
  agents: [{ id: 'agent-1', name: 'Arthur Martin', checkInTime: '2026-10-13T06:00:00Z', checkOutTime: '2026-10-13T09:00:00Z' }],
  truckLabels: [],
  ...over,
});

describe('clôture d’une mission', () => {
  beforeEach(() => jest.clearAllMocks());

  it('valide une mission à valider, après confirmation', async () => {
    (fetchInterventionById as jest.Mock)
      .mockResolvedValueOnce(mission())
      .mockResolvedValueOnce(mission({ status: 'COMPLETED' }));
    (updateInterventionStatus as jest.Mock).mockResolvedValue({});
    const onChanged = jest.fn();
    render(<MissionDetail interventionId="int-1" onChanged={onChanged} />);

    fireEvent.press(await screen.findByText('Valider la mission'));
    expect(updateInterventionStatus).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Confirmer la validation'));

    await waitFor(() => expect(updateInterventionStatus).toHaveBeenCalledWith('t', 'int-1', 'COMPLETED'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('affiche le refus du serveur sans changer la mission', async () => {
    (fetchInterventionById as jest.Mock).mockResolvedValue(mission());
    (updateInterventionStatus as jest.Mock).mockRejectedValue(
      new ApiError('Validation impossible : Heures manquantes (fin)', 400),
    );
    render(<MissionDetail interventionId="int-1" />);
    fireEvent.press(await screen.findByText('Valider la mission'));
    fireEvent.press(screen.getByText('Confirmer la validation'));
    expect(await screen.findByText(/Heures manquantes/)).toBeTruthy();
  });

  it("ne propose pas de validation pour une mission à venir", async () => {
    (fetchInterventionById as jest.Mock).mockResolvedValue(mission({ status: 'PLANNED' }));
    render(<MissionDetail interventionId="int-1" />);
    await screen.findByText('Résidence des Acacias');
    expect(screen.queryByText('Valider la mission')).toBeNull();
  });

  it("dit clairement qu'une mission d'un autre site est inaccessible", async () => {
    (fetchInterventionById as jest.Mock).mockRejectedValue(new ApiError('Interdit', 403));
    render(<MissionDetail interventionId="int-z" />);
    expect(await screen.findByText(/n'est pas sur l'un de vos sites/)).toBeTruthy();
  });

  it('se modifie par son gabarit : ni déplacement ni changement d’agents isolé', async () => {
    (fetchInterventionById as jest.Mock).mockResolvedValue(mission({ status: 'PLANNED' }));
    render(<MissionDetail interventionId="int-1" />);
    expect(await screen.findByText('Modifier le gabarit')).toBeTruthy();
    expect(screen.queryByText('Déplacer')).toBeNull();
    expect(screen.queryByText('Changer les agents')).toBeNull();
    expect(screen.getByText('Annuler la mission')).toBeTruthy();
  });
});
