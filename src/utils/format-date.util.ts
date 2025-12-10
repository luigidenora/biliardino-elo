/**
 * Formats a timestamp (in milliseconds) into a readable date string.
 *
 * The output format is:
 * `Giorno, D/M/YYYY` (e.g., "Martedì, 10/12/2025")
 *
 * @param ms - A timestamp expressed in milliseconds since the Unix epoch.
 * @returns A formatted date string.
 */
export function formatDate(ms: number): string {
  const d = new Date(ms);

  const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const dayName = days[d.getDay()];

  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();

  return `${dayName}, ${day}/${month}/${year}`;
}
