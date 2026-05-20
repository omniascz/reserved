export function formatPrice(hellers: number, currency: string): string {
  const value = (hellers / 100).toLocaleString('cs-CZ');
  return `${value} ${currency === 'CZK' ? 'Kč' : currency}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const DAY_LABELS: Record<string, string> = {
  mon: 'Pondělí',
  tue: 'Úterý',
  wed: 'Středa',
  thu: 'Čtvrtek',
  fri: 'Pátek',
  sat: 'Sobota',
  sun: 'Neděle',
};
