/** Dimanche de Pâques (algorithme de Gauss, calendrier grégorien), à minuit UTC. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const cache = new Map<number, Set<string>>();

/** Jours fériés légaux en France métropolitaine (YYYY-MM-DD). */
export function frenchPublicHolidays(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);
  const dates = [
    new Date(Date.UTC(year, 0, 1)),
    addDays(easter, 1),
    new Date(Date.UTC(year, 4, 1)),
    new Date(Date.UTC(year, 4, 8)),
    addDays(easter, 39),
    addDays(easter, 50),
    new Date(Date.UTC(year, 6, 14)),
    new Date(Date.UTC(year, 7, 15)),
    new Date(Date.UTC(year, 10, 1)),
    new Date(Date.UTC(year, 10, 11)),
    new Date(Date.UTC(year, 11, 25)),
  ];
  const set = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  cache.set(year, set);
  return set;
}

export const isFrenchPublicHoliday = (date: string) => frenchPublicHolidays(Number(date.slice(0, 4))).has(date.slice(0, 10));
