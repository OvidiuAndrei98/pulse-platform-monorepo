type DateValue = Date | string | null | undefined;

/** Locale is an input, never an application's global i18n singleton. */
export function formatEventTime(value: DateValue, language = 'en') {
  const date = value instanceof Date ? value : new Date(value ?? '');
  return Number.isNaN(date.getTime()) ? '--:--' : new Intl.DateTimeFormat(
    language === 'ro' ? 'ro-RO' : 'en-GB',
    { hour: '2-digit', minute: '2-digit', hour12: false },
  ).format(date);
}
