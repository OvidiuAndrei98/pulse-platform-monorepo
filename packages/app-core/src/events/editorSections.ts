export const basicsFields: Array<'title' | 'bannerUrl' | 'description' | 'category' | 'vibe'> = [
  "title",
  "bannerUrl",
  "description",
  "category",
  "vibe",
];
export const scheduleFields: Array<'startTime' | 'endTime' | 'locationName' | 'city' | 'latitude' | 'longitude' | 'googlePlaceId'> = [
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
  errors: Partial<Record<(typeof basicsFields)[number] | (typeof scheduleFields)[number] | 'lineup' | 'ticketingMode' | 'externalTicketUrl' | 'ticketTypes' | 'organizerAbsorbsServiceFee' | 'vatPercentage' | 'status' | 'publishAt', unknown>>,
  mode: "create" | "edit",
): { step: number; section: EditorSection } | undefined {
  if (basicsFields.some((field) => errors[field]))
    return { step: 0, section: "details" };
  if (scheduleFields.some((field) => errors[field]))
    return { step: 1, section: "details" };
  if (errors.lineup) return { step: 0, section: "lineup" };
  if (errors.ticketingMode || errors.externalTicketUrl || errors.ticketTypes || errors.organizerAbsorbsServiceFee || errors.vatPercentage)
    return { step: 2, section: "tickets" };
  if (errors.status || errors.publishAt)
    return { step: 2, section: mode === "edit" ? "details" : "tickets" };
  return undefined;
}
