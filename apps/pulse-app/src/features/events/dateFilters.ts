import { EventFilters } from "@/features/events/types";

type DateRange = {
  startsAfter?: string;
  startsBefore?: string;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getEventDateRange(dateFilter: EventFilters["date"]): DateRange {
  const now = new Date();
  const today = startOfDay(now);

  switch (dateFilter) {
    case "Tonight":
      return { startsAfter: now.toISOString(), startsBefore: addDays(today, 1).toISOString() };
    case "Tomorrow": {
      const tomorrow = addDays(today, 1);
      return { startsAfter: tomorrow.toISOString(), startsBefore: addDays(tomorrow, 1).toISOString() };
    }
    case "This weekend": {
      const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
      const saturday = addDays(today, daysUntilSaturday);
      return { startsAfter: saturday.toISOString(), startsBefore: addDays(saturday, 2).toISOString() };
    }
    case "Next week": {
      const daysUntilNextMonday = ((8 - today.getDay()) % 7) || 7;
      const nextMonday = addDays(today, daysUntilNextMonday);
      return { startsAfter: nextMonday.toISOString(), startsBefore: addDays(nextMonday, 7).toISOString() };
    }
    default:
      return {};
  }
}
