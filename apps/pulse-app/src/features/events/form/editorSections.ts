import type { FieldErrors, FieldPath } from "react-hook-form";
import type { EventFormValues } from "@/app/dashboard/components/EventsForm";

export const basicsFields: FieldPath<EventFormValues>[] = [
  "title",
  "bannerUrl",
  "description",
  "category",
  "vibe",
];
export const scheduleFields: FieldPath<EventFormValues>[] = [
  "startTime",
  "endTime",
  "locationName",
  "city",
  "latitude",
  "longitude",
  "googlePlaceId",
];
export type EditorSection = "details" | "lineup" | "tickets" | "admin";

// Route validation errors to visible controls, including errors in collapsed sections.
export function getErrorDestination(
  errors: FieldErrors<EventFormValues>,
  mode: "create" | "edit",
): { step: number; section: EditorSection } | undefined {
  if (basicsFields.some((field) => errors[field as keyof EventFormValues]))
    return { step: 0, section: "details" };
  if (scheduleFields.some((field) => errors[field as keyof EventFormValues]))
    return { step: 1, section: "details" };
  if (errors.lineup) return { step: 0, section: "lineup" };
  if (errors.ticketTypes || errors.organizerAbsorbsServiceFee || errors.vatPercentage)
    return { step: 2, section: "tickets" };
  if (errors.status || errors.publishAt)
    return { step: 2, section: mode === "edit" ? "details" : "tickets" };
  return undefined;
}
