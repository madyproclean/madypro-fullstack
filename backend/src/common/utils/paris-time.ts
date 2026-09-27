/**
 * Les horaires d'intervention ("HH:mm") sont exprimés à l'heure de Paris : conversion en instant
 * UTC réel (même calcul que le pointage), changements d'heure compris.
 */
export function parisDateTime(dateStr: string, time: string): Date {
  const [hours, minutes] = time.split(':').map((v) => parseInt(v, 10) || 0);
  const [year, month, day] = dateStr.split('-').map((v) => parseInt(v, 10));
  const guessUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const parisString = guessUtc.toLocaleString('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parisAsUtc = new Date(`${parisString.replace(',', '')} UTC`);
  return new Date(guessUtc.getTime() + (guessUtc.getTime() - parisAsUtc.getTime()));
}

/** Date du jour à Paris, au format YYYY-MM-DD. */
export function parisToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
}
