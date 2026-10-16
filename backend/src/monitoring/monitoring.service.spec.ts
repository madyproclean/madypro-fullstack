import { MonitoringService } from './monitoring.service';

describe('journal des erreurs', () => {
  it('regroupe une même erreur malgré des identifiants différents', () => {
    const a = MonitoringService.fingerprint({ source: 'SERVER', message: 'Intervention 123 introuvable', stack: 'Error\n    at f (a.ts:10:5)' });
    const b = MonitoringService.fingerprint({ source: 'SERVER', message: 'Intervention 456 introuvable', stack: 'Error\n    at f (a.ts:12:9)' });
    const c = MonitoringService.fingerprint({ source: 'WEB', message: 'Intervention 123 introuvable', stack: 'Error\n    at f (a.ts:10:5)' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('compte une erreur déjà connue et prévient les admins seulement la première fois', async () => {
    const store = new Map<string, any>();
    const prisma: any = {
      errorEvent: {
        findUnique: jest.fn(({ where }) => Promise.resolve(store.get(where.fingerprint) ?? null)),
        create: jest.fn(({ data }) => (store.set(data.fingerprint, { ...data, count: 1 }), Promise.resolve(data))),
        update: jest.fn(({ where }) => {
          store.get(where.fingerprint).count += 1;
          return Promise.resolve(store.get(where.fingerprint));
        }),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin' }]) },
    };
    const notifications: any = { send: jest.fn().mockResolvedValue(undefined) };
    const service = new MonitoringService(prisma, notifications);
    const first = await service.record({ source: 'MOBILE', message: 'Plantage écran mission' });
    const second = await service.record({ source: 'MOBILE', message: 'Plantage écran mission' });
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect([...store.values()][0].count).toBe(2);
    expect(notifications.send).toHaveBeenCalledTimes(1);
  });
});
