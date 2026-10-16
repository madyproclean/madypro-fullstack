import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { SyncProvider, useSyncContext } from '../SyncContext';
import { NetworkError } from '@/services/api/client';

const mockCalls: string[] = [];
let mockOnline = false;
const mockListeners: Array<(s: any) => void> = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: (fn: any) => {
    mockListeners.push(fn);
    fn({ isConnected: mockOnline, isInternetReachable: mockOnline });
    return () => undefined;
  },
}));
jest.mock('../AuthContext', () => ({ useAuthContext: () => ({ token: 't', user: { id: 'agent-1' } }) }));
jest.mock('@/services/api/attendance.api', () => ({
  markArrival: jest.fn(async () => mockCalls.push('ARRIVAL')),
  checkIn: jest.fn(async () => mockCalls.push('START')),
  checkOut: jest.fn(async () => mockCalls.push('END')),
}));
jest.mock('@/services/api/interventions.api', () => ({
  toggleInterventionChecklistItem: jest.fn(async (_t: string, _i: string, item: string, done: boolean) => mockCalls.push(`CHECK ${item} ${done}`)),
}));
jest.mock('@/services/api/anomalies.api', () => ({ createAnomaly: jest.fn(async () => mockCalls.push('ANOMALY')) }));

let ctx: ReturnType<typeof useSyncContext>;
const Probe = () => {
  ctx = useSyncContext();
  return null;
};

describe('file hors ligne de l’agent', () => {
  it('garde l’ordre des actions et envoie tout au retour du réseau', async () => {
    render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    );
    const base = { userId: 'agent-1', interventionId: 'm1', siteId: 's1', timestamp: '2026-10-16T06:00:00Z', coordinates: { latitude: 1, longitude: 2 } };
    await act(async () => {
      await ctx.queueEvent({ ...base, type: 'START', photo: 'p' });
      await ctx.queueEvent({ ...base, type: 'CHECKLIST', checklistItemId: 'c1', done: true });
      await ctx.queueEvent({ ...base, type: 'ANOMALY', anomaly: { type: 'OTHER', description: 'Fuite', photos: [] } });
      await ctx.queueEvent({ ...base, type: 'END', photo: 'p' });
    });
    expect(ctx.pendingEvents.map((e) => e.type)).toEqual(['START', 'CHECKLIST', 'ANOMALY', 'END']);
    mockOnline = true;
    await act(async () => mockListeners.forEach((fn) => fn({ isConnected: true, isInternetReachable: true })));
    await waitFor(() => expect(ctx.pendingEvents).toHaveLength(0));
    expect(mockCalls).toEqual(['START', 'CHECK c1 true', 'ANOMALY', 'END']);
  });

  it('n’empile pas une action refusée par le serveur', async () => {
    mockOnline = true;
    const { createAnomaly } = jest.requireMock('@/services/api/anomalies.api');
    (createAnomaly as jest.Mock).mockRejectedValueOnce(new Error('Refusé'));
    render(
      <SyncProvider>
        <Probe />
      </SyncProvider>,
    );
    await expect(
      ctx.queueEvent({ userId: 'a', interventionId: 'm1', siteId: 's', type: 'ANOMALY', timestamp: '', anomaly: { type: 'X', description: 'd', photos: [] } }),
    ).rejects.toThrow('Refusé');
    expect(ctx.pendingEvents).toHaveLength(0);
    expect(NetworkError).toBeDefined();
  });
});
