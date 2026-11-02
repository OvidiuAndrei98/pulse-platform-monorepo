"use client";
import {CheckCircle2,XCircle} from "lucide-react";
import {useTranslation} from "react-i18next";
import type {ScannerResult} from "../useTicketValidation.contracts";
export function ScannerResultFeedback({
    result: scanResult,
  }: {
    result: ScannerResult;
  }) {
 const {t}=useTranslation();
    const accepted =
      scanResult.status === "valid" || scanResult.status === "offline_valid";
    const title =
      scanResult.status === "valid"
        ? t("scanner.validTicket")
        : scanResult.status === "offline_valid"
          ? t("validation.offlineValid")
          : scanResult.status === "offline_duplicate"
            ? t("validation.offlineDuplicate")
            : scanResult.status === "offline_unknown"
              ? t("validation.offlineUnknown")
              : scanResult.status === "offline_expired"
                ? t("validation.offlineExpired")
                : scanResult.status === "offline_unprepared"
                  ? t("validation.offlineUnprepared")
                  : scanResult.status === "invalid"
                    ? t("validation.invalidTicket")
                    : t("scanner.usedTicket");

    return (
      <div
        role="status"
        className={`flex gap-3 rounded-xl border p-4 shadow-2xl backdrop-blur-xl ${accepted ? "border-primary/35 bg-[#102212]/95" : "border-amber-300/35 bg-[#2a2110]/95"}`}
      >
        {accepted ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {scanResult.ticketType && (
            <p className="mt-1 truncate text-xs text-white/65">
              {scanResult.ticketType} - {scanResult.eventTitle}
            </p>
          )}
        </div>
      </div>
    );
  }
