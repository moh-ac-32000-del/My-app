// datetime-local uses the user's wall-clock time, not a UTC calendar date.
export function formatReminderDateTime(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${String(value.getFullYear()).padStart(4, '0')}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function parseReminderDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  // Reject blank/partial input, calendar rollover and nonexistent local DST times.
  if (!Number.isFinite(date.getTime()) || formatReminderDateTime(date) !== value) return null;
  return date;
}
