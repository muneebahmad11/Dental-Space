// The one way to show a moment in time to staff: always in the clinic's own timezone, never the browser's.
// A receptionist travelling or using a mis-set computer still sees clinic time.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function clinicDateTime(value: string | number | Date, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) { formatter = new Intl.DateTimeFormat('en-PK', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }); formatters.set(timezone, formatter); }
  return formatter.format(new Date(value));
}
