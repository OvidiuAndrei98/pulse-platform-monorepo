

import { ReadableSchema } from "@packages/api-client/client";

import { apiRoot } from "@/core/apiRoot";

import { ValidationEvent } from "@/core/DataProvider";

export const ORGANIZER_AGREEMENT_VERSION = "2026-10-18";

export const apiHealthUrl = apiRoot.replace(/\/api\/v1\/?$/, "/health");

export type ValidationStaff = ReadableSchema<"ValidationStaffResponse">;

export type TicketValidation = ReadableSchema<"TicketValidationResponse">;

export type ScannerAccess = ReadableSchema<"ScannerAccessResponse">;

export type CreatedScannerAccess = ReadableSchema<"CreateScannerAccessResponse">;

export type OfflineSnapshotResponse =
  ReadableSchema<"OfflineValidationSnapshotResponse">;

export type OfflineSyncResponse = ReadableSchema<"SyncOfflineTicketScansResponse">;

export type ValidationScanHistoryResponse = {
  totalScans: number;
  scans: Array<{ ticketId: string; ticketType: string; validatedAt: string }>;
};

export type ScannerResult =
  | TicketValidation
  | {
      status:
        | "offline_valid"
        | "offline_duplicate"
        | "offline_unknown"
        | "offline_expired"
        | "offline_unprepared"
        | "invalid";
      ticketType?: string;
      eventTitle?: string;
    };

export function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function isValidationEventActive(event: ValidationEvent) {
  return (
    event.status === "published" &&
    new Date(event.endTime).getTime() > Date.now()
  );
}
