import { parisDateTime, parisToday } from './paris-time';

describe('heure de Paris', () => {
  it('convertit un horaire de Paris en instant réel, heure d’été et d’hiver', () => {
    expect(parisDateTime('2026-10-12', '06:30').toISOString()).toBe('2026-10-12T04:30:00.000Z');
    expect(parisDateTime('2026-12-12', '06:30').toISOString()).toBe('2026-12-12T05:30:00.000Z');
  });

  it('ne décale pas d’un jour les horaires proches de minuit (22h–23h59)', () => {
    expect(parisDateTime('2026-10-12', '22:00').toISOString()).toBe('2026-10-12T20:00:00.000Z');
    expect(parisDateTime('2026-10-12', '22:45').toISOString()).toBe('2026-10-12T20:45:00.000Z');
    expect(parisDateTime('2026-12-12', '23:30').toISOString()).toBe('2026-12-12T22:30:00.000Z');
    expect(parisDateTime('2026-10-13', '00:00').toISOString()).toBe('2026-10-12T22:00:00.000Z');
  });

  it('donne la date du jour à Paris', () => {
    expect(parisToday(new Date('2026-10-15T22:30:00Z'))).toBe('2026-10-16');
  });
});
