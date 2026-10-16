import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { TemplateEditorSheet } from '../TemplateEditorSheet';
import { previewSiteTemplateImpact, saveSiteTemplate } from '@/services/api/supervision.api';

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
  previewSiteTemplateImpact: jest.fn().mockResolvedValue({
    period: { startDate: '2026-10-16', endDate: '2026-10-29' },
    requiresValidation: true,
    added: [{ date: '2026-10-19', startTime: '07:00', endTime: '10:00', categoryLabel: 'Parties communes', agents: [] }],
    removed: [],
    changed: [],
    warnings: ['Arthur Martin est en absence validée le 2026-10-21 : prévoir un remplaçant ce jour-là.'],
  }),
}));

describe('gabarit d’un site sur la tablette', () => {
  beforeEach(() => jest.clearAllMocks());

  it("n'envoie rien tant que le gabarit n'a pas changé", async () => {
    render(<TemplateEditorSheet visible siteId="site-a" onClose={jest.fn()} />);
    await screen.findByText('Créneau 1');
    fireEvent.press(screen.getByText('Voir l’effet sur le planning'));
    expect(previewSiteTemplateImpact).not.toHaveBeenCalled();
    expect(saveSiteTemplate).not.toHaveBeenCalled();
  });

  it('ajoute un créneau et renvoie tous les créneaux, ponctuel compris', async () => {
    const onClose = jest.fn();
    render(<TemplateEditorSheet visible siteId="site-a" onClose={onClose} />);
    await screen.findByText('Créneau 1');
    fireEvent.press(screen.getByText('Ajouter un créneau'));
    expect(screen.getByText('Créneau 3')).toBeTruthy();
    // D'abord l'effet sur le planning (alertes comprises), puis l'envoi.
    fireEvent.press(screen.getByText('Voir l’effet sur le planning'));
    await screen.findByText('Missions ajoutées (1)');
    expect(screen.getByText(/en absence validée/)).toBeTruthy();
    expect(saveSiteTemplate).not.toHaveBeenCalled();
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
    fireEvent.press(screen.getByText('Voir l’effet sur le planning'));
    expect(saveSiteTemplate).not.toHaveBeenCalled();
    expect(screen.getByText('Créneau 1 : choisissez au moins un jour.')).toBeTruthy();
  });
});

describe('version en attente', () => {
  it('reprend la modification déjà envoyée et rappelle que la version validée reste active', async () => {
    const { listSiteTemplates } = jest.requireMock('@/services/api/supervision.api');
    (listSiteTemplates as jest.Mock).mockResolvedValueOnce([
      {
        id: 'tpl-1',
        label: 'Gabarit Acacias',
        siteId: 'site-a',
        startDate: '2026-10-01',
        endDate: null,
        active: true,
        validatedAt: '2026-10-02T08:00:00.000Z',
        stops: [{ id: 'stop-1', daysOfWeek: [1], intervalWeeks: 1, categoryId: 'cat-1', startTime: '07:00', endTime: '10:00', agentIds: [] }],
        pendingVersion: {
          stops: [
            { id: 'stop-1', daysOfWeek: [1], intervalWeeks: 1, categoryId: 'cat-1', startTime: '07:00', endTime: '10:00', agentIds: [] },
            { daysOfWeek: [5], intervalWeeks: 1, categoryId: 'cat-1', startTime: '18:00', endTime: '20:00', agentIds: [] },
          ],
        },
      },
    ]);
    render(<TemplateEditorSheet visible siteId="site-a" onClose={jest.fn()} />);
    await screen.findByText('Créneau 2');
    expect(screen.getByText(/la version validée continue de s'appliquer/)).toBeTruthy();
  });
});
