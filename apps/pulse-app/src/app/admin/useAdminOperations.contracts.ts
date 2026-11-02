

import { type OrganizerVerificationRequest } from "@/core/DataProvider";

export type VerificationStatus = "pending" | "approved" | "rejected";

export type StatusFilter = "all" | VerificationStatus;

export type StripeStatus = "active" | "onboarding" | "attention" | "notConnected";

export function getStripeStatus(request: OrganizerVerificationRequest): StripeStatus {
  if (!request.stripeAccountId) return "notConnected";
  if (!request.stripeDetailsSubmitted) return "onboarding";
  if (request.stripeChargesEnabled && request.stripePayoutsEnabled) return "active";
  return "attention";
}
