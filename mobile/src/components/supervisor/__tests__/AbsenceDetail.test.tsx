import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AbsenceDetail } from '../AbsenceDetail';
import { approveAbsenceLevel1, decideAbsence } from '@/services/api/supervision.api';
import { TeamAbsence } from '@/types/supervision';

jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ token: 't', user: { id: 'sup-1' } }) }));
jest.mock('@/context/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/services/api/supervision.api', () => ({
  decideAbsence: jest.fn(),
  approveAbsenceLevel1: jest.fn(),
  getTeamAbsence: jest.fn(),
  getReplacementSuggestions: jest.fn().mockResolvedValue({ absenceId: 'abs-1', interventions: [] }),
}));

const absence = (over: Partial<TeamAbsence> = {}): TeamAbsence => ({
  id: 'abs-1',
  agent: { id: 'agent-1', name: 'Arthur Martin' },
  type: 'SICK',
  status: 'PENDING',
  from: '2026-10-14T00:00:00.000Z',
  to: '2026-10-15T23:59:59.000Z',
  reason: 'Grippe',
  ...over,
});

describe('validation d’une absence', () => {
  beforeEach(() => jest.clearAllMocks());

  it('approuve une absence courte', async () => {
    (decideAbsence as jest.Mock).mockResolvedValue(absence({ status: 'APPROVED' }));
    const onChanged = jest.fn();
    render(<AbsenceDetail absenceId="abs-1" initial={absence()} onChanged={onChanged} />);
    fireEvent.press(screen.getByText('Approuver'));
    await waitFor(() => expect(decideAbsence).toHaveBeenCalledWith('t', 'abs-1', 'APPROVED'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('exige un motif avant de refuser', async () => {
    (decideAbsence as jest.Mock).mockResolvedValue(absence({ status: 'REJECTED' }));
    render(<AbsenceDetail absenceId="abs-1" initial={absence()} />);
    fireEvent.press(screen.getByText('Refuser'));
    expect(decideAbsence).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Motif du refus'), 'Effectif insuffisant');
    fireEvent.press(screen.getByText('Refuser'));
    await waitFor(() =>
      expect(decideAbsence).toHaveBeenCalledWith('t', 'abs-1', 'REJECTED', 'Effectif insuffisant'),
    );
  });

  it("transmet une absence longue à l'administrateur au lieu de l'approuver", async () => {
    (approveAbsenceLevel1 as jest.Mock).mockResolvedValue(absence({ requiresSecondApproval: true, level1ApprovedBy: 'sup-1' }));
    render(<AbsenceDetail absenceId="abs-1" initial={absence({ requiresSecondApproval: true })} />);
    fireEvent.press(screen.getByText('Donner mon accord'));
    await waitFor(() => expect(approveAbsenceLevel1).toHaveBeenCalledWith('t', 'abs-1'));
    expect(decideAbsence).not.toHaveBeenCalled();
  });
});
