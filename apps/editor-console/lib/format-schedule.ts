const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "America/Toronto",
});

const timeFormatter = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto",
});

const calendarDateFormatter = new Intl.DateTimeFormat("en-CA", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A bare `YYYY-MM-DD` is a calendar date, not an instant: `new Date()` would
 * read it as UTC midnight and show the previous evening in Toronto. Format it
 * in UTC from its own parts and omit the time.
 */
export function formatSchedule(startsAt: string) {
  const dateOnly = dateOnlyPattern.exec(startsAt.trim());
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return calendarDateFormatter.format(
      new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
    );
  }
  const date = new Date(startsAt);
  return `${dateFormatter.format(date)} · ${timeFormatter.format(date)}`;
}
