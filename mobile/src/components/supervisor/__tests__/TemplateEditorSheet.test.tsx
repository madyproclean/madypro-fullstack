import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TemplateEditorSheet } from '../TemplateEditorSheet';
import { saveSiteTemplate } from '@/services/api/supervision.api';

jest.mock('@/context/AuthContext', () => ({ useAuthContext: () => ({ token: 't', user: { id: 'sup-1' } }) }));
jest.mock('@/context/ToastContext', () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock('@/services/api/supervision.api', () => ({
  listSupervisedSites: jest.fn().mockResolvedValue([{ id: 'site-a', name: 'Acacias', address: '', active: true }]),
  listActiveAgents: jest.fn().mockResolvedValue([{ id: 'agent-1', name: 'Arthur Martin' }]),
  listSitePrestations: jest.fn().mockResolvedValue([
    {
      id: 'sc-1',
      categoryId: 'cat-1',
      startTime: '07:00',
      endTime: '10:00',
      active: true,
      category: { id: 'cat-1', label: 'Parties communes' },
    },
  ]),
  listSiteTemplates: jest.fn().mockResolvedValue([
    {
      id: 'tpl-1',
      label: 'Gabarit Acacias',
      siteId: 'site-a',
      startDate: '2026-10-01',
      endDate: null,
      active: true,
      validatedAt: '2026-10-02T08:00:00.000Z',
      stops: [
        { id: 'stop-1', daysOfWeek: [1, 3], intervalWeeks: 1, categoryId: 'cat-1', startTime: '07:00', endTime: '10:00', agentIds: ['agent-1'] },
        { id: 'stop-2', daysOfWeek: [], intervalWeeks: 1, specificDate: '2026-10-20T00:00:00.000Z', startTime: '14:00', endTime: '16:00', agentIds: [] },
      ],
    },
  ]),
  saveSiteTemplate: jest.fn().mockResolvedValue({}),
}));

describe('gabarit d’un site sur la tablette', () => {
  beforeEach(() => jest.clearAllMocks());

  it("n'envoie rien tant que le gabarit n'a pas changé", async () => {
    render(<TemplateEditorSheet visible siteId="site-a" onClose={jest.fn()} />);
    await screen.findByText('Créneau 1');
    fireEvent.press(screen.getByText('Envoyer pour validation'));
    expect(saveSiteTemplate).not.toHaveBeenCalled();
  });

  it('ajoute un créneau et renvoie tous les créneaux, ponctuel compris', async () => {
    const onClose = jest.fn();
    render(<TemplateEditorSheet visible siteId="site-a" onClose={onClose} />);
    await screen.findByText('Créneau 1');
    fireEvent.press(screen.getByText('Ajouter un créneau'));
    expect(screen.getByText('Créneau 3')).toBeTruthy();
    fireEvent.press(screen.getByText('Envoyer pour validation'));

    await waitFor(() => expect(saveSiteTemplate).toHaveBeenCalled());
    const [, templateId, input] = (saveSiteTemplate as jest.Mock).mock.calls[0];
    expect(templateId).toBe('tpl-1');
    expect(input.stops).toHaveLength(3);
    expect(input.stops[1]).toEqual(expect.objectContaining({ id: 'stop-2', specificDate: '2026-10-20T00:00:00.000Z' }));
    // Le nouveau créneau reprend la prestation du site.
    expect(input.stops[2]).toEqual(expect.objectContaining({ categoryId: 'cat-1', startTime: '07:00', endTime: '10:00' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('refuse un créneau sans jour', async () => {
    render(<TemplateEditorSheet visible siteId="site-a" onClose={jest.fn()} />);
    await screen.findByText('Créneau 1');
    fireEvent.press(screen.getByLabelText('lundi'));
    fireEvent.press(screen.getByLabelText('mercredi'));
    fireEvent.press(screen.getByText('Envoyer pour validation'));
    expect(saveSiteTemplate).not.toHaveBeenCalled();
    expect(screen.getByText('Créneau 1 : choisissez au moins un jour.')).toBeTruthy();
  });
});
