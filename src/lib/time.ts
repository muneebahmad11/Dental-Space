// The one way to show a moment in time to staff: always in the clinic's own timezone, never the browser's.
// A receptionist travelling or using a mis-set computer still sees clinic time.
// Format: "14 Nov 2026, 2:36 pm", the way dates are written by hand in Pakistan.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function clinicDateTime(value: string | number | Date, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) { formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); formatters.set(timezone, formatter); }
  return formatter.format(new Date(value)).replace(/\s?(am|pm)$/i, m => m.toLowerCase().replace(/^\s?/, ' '));
}

// A calendar date with no time (a payment date, a due date, a date of birth): "14 Nov 2026".
// These are stored as plain YYYY-MM-DD values, so they are read as-is and never shifted by a timezone.
const dateOnly = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export function clinicDate(isoDate: string | null | undefined) {
  if (!isoDate) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.slice(0, 10));
  return m ? dateOnly.format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))) : isoDate;
}
