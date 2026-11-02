/** Fixed public bridge destinations. Return parameters are hints, never proof of payment. */
export const NATIVE_ORGANIZER_RETURN = "spottr-native://organizer/return";
export type OrganizerReturn =
  | { flow: "connect"; status: "complete" | "refresh" }
  | { flow: "promotion"; status: "complete" | "cancelled"; campaignId: string };

export function parseOrganizerReturn(
  params: URLSearchParams,
): OrganizerReturn | null {
  const flow = params.get("flow"),
    status = params.get("status");
  if (flow === "connect" && (status === "complete" || status === "refresh"))
    return { flow, status };
  const campaignId = params.get("campaignId");
  if (
    flow === "promotion" &&
    (status === "complete" || status === "cancelled") &&
    campaignId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      campaignId,
    )
  ) {
    return { flow, status, campaignId };
  }
  return null;
}

export function nativeOrganizerReturn(params: URLSearchParams) {
  const result = parseOrganizerReturn(params);
  return result
    ? `${NATIVE_ORGANIZER_RETURN}?${new URLSearchParams(result).toString()}`
    : null;
}
