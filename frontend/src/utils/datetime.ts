const defaultFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

export function formatDateTime(value: string | number | Date, formatter: Intl.DateTimeFormat = defaultFormatter) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return formatter.format(date);
}

/** Formate une heure ("HH:mm" ou ISO) en heure locale FR ("HH:mm"), "—" si absente. */
export function formatHour(value?: string | null) {
  if (!value) return '—';
  const date = value.includes('T') ? new Date(value) : new Date(`1970-01-01T${value}`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Normalise une heure ("HH:mm" ou ISO) en "HH:mm" pour un <input type="time">, "" si absente. */
export function timeValue(value?: string | null) {
  if (!value) return '';
  if (value.includes('T')) return value.slice(11, 16);
  return value;
}
