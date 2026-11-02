import i18n from "@/i18n";
import { formatEventTime as coreEventTime } from '@packages/app-core/events/dateFormat';

type DateValue = Date | string | null | undefined;

function toValidDate(value: DateValue) {
  const date = value instanceof Date ? value : new Date(value ?? "");
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function locale() {
  return i18n.language === "ro" ? "ro-RO" : "en-GB";
}

function format(value: DateValue, options: Intl.DateTimeFormatOptions) {
  const date = toValidDate(value);
  return date ? new Intl.DateTimeFormat(locale(), options).format(date) : i18n.t("date.unknown");
}

export function formatEventDate(value: DateValue) {
  return format(value, { day: "numeric", month: "short", year: "numeric" });
}

export function formatEventDateShort(value: DateValue) {
  return format(value, { day: "numeric", month: "short" });
}

export function formatEventTime(value: DateValue) {
  return coreEventTime(value, i18n.language);
}

export function formatEventDateTime(value: DateValue) {
  const date = toValidDate(value);
  if (!date) return i18n.t("date.unknown");
  const datePart = new Intl.DateTimeFormat(locale(), { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(date);
  return `${datePart} · ${formatEventTime(date)}`;
}
