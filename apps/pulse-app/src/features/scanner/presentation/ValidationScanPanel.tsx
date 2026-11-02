"use client";
import {ScannerResultFeedback} from "./ScannerResultFeedback";

import { ClipboardCheck, Loader2, ScanLine, History, Download, RefreshCw } from "lucide-react";

import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";

import { IconButton } from '@/components/ui/ActionButton';
import { TextArea as UITextArea } from '@/components/ui/Field';

import type { TicketValidationWorkspaceModel } from "../useTicketValidation";

export function ValidationScanPanel({model}: {model: Pick<TicketValidationWorkspaceModel, "admissionsClosed" | "isOnline" | "offlineConflicts" | "offlinePendingCount" | "offlineSnapshot" | "prepareOffline" | "preparingOffline" | "removeOfflineData" | "result" | "scanHistory" | "scanHistoryLoading" | "selectedEvent" | "selectedEventId" | "setScanHistoryOpen" | "setValidationHash" | "submitValidationHash" | "syncOfflineScans" | "syncingOffline" | "t" | "validateTicket" | "validating" | "validationHash">}) {
 const { admissionsClosed, isOnline, offlineConflicts, offlinePendingCount, offlineSnapshot, prepareOffline, preparingOffline, removeOfflineData, result, scanHistory, scanHistoryLoading, selectedEvent, selectedEventId, setScanHistoryOpen, setValidationHash, submitValidationHash, syncOfflineScans, syncingOffline, t, validateTicket, validating, validationHash }=model;
 if(!selectedEvent)return null;
 return (<section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <ScanLine className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold">
                  {t("validation.verifyTicket")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedEvent
                    ? selectedEvent.title
                    : t("validation.ticketHint")}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-primary/25 bg-primary/[0.04] p-4 sm:p-5">
              <QrCameraScanner
                disabled={!selectedEventId || validating || admissionsClosed}
                onScan={submitValidationHash}
                fullScreen
                continuous
                eventTitle={selectedEvent?.title}
                isOnline={isOnline}
                scanFeedback={
                  result ? <ScannerResultFeedback result={result} /> : undefined
                }
                className="h-12 w-full rounded-lg border-0 bg-[var(--ui-action)] px-4 text-sm text-white hover:bg-primary/90"
              />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {t("validation.cameraHint")}
              </p>
            </div>

            <details className="group mt-4 rounded-lg border border-white/10 bg-black/10">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
                {t("validation.enterCodeManually")}
              </summary>
              <form
                onSubmit={validateTicket}
                className="space-y-3 border-t border-white/10 p-4"
              >
                <UITextArea
                  disabled={admissionsClosed}
                  value={validationHash}
                  onChange={(event) => setValidationHash(event.target.value)}
                  rows={3}
                  placeholder={t("validation.pasteQr")}
                  className="w-full resize-none font-mono transition placeholder:font-sans placeholder:text-sm"
                />
                <button
                  type="submit"
                  disabled={
                    !selectedEventId || !validationHash.trim() || validating || admissionsClosed
                  }
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50 sm:w-auto"
                >
                  {validating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ClipboardCheck className="h-4 w-4" />
                  )}
                  {validating ? t("scanner.validating") : t("scanner.validate")}
                </button>
              </form>
            </details>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="min-w-0 text-xs text-muted-foreground">
                {offlineSnapshot && (
                  <span>
                    {t("validation.offlineReady", {
                      count: offlineSnapshot.ticketCount,
                    })}
                  </span>
                )}
                {offlinePendingCount > 0 && (
                  <span className="ml-2 font-semibold text-amber-200">
                    {t("validation.offlinePending", {
                      count: offlinePendingCount,
                    })}
                  </span>
                )}
                {!offlineSnapshot && <span>{t("validation.offlineHint")}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {offlineSnapshot && (
                  <button
                    type="button"
                    onClick={() => void removeOfflineData()}
                    disabled={offlinePendingCount > 0 || syncingOffline || preparingOffline}
                    className="h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-muted-foreground transition hover:bg-white/5 disabled:opacity-50"
                  >
                    {t("validation.offlineRemove")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    void (offlinePendingCount
                      ? syncOfflineScans()
                      : prepareOffline())
                  }
                  disabled={
                    !selectedEventId ||
                    !isOnline ||
                    preparingOffline ||
                    syncingOffline
                  }
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
                >
                  {preparingOffline || syncingOffline ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : offlinePendingCount ? (
                    <RefreshCw className="h-3.5 w-3.5" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {offlinePendingCount
                    ? t("validation.syncNow")
                    : t("validation.prepareOffline")}
                </button>
              </div>
            </div>

            {offlineConflicts.length > 0 && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2.5 text-sm">
                <span className="font-semibold text-amber-100">
                  {t("validation.offlineConflictsTitle", {
                    count: offlineConflicts.length,
                  })}
                </span>
                <span className="text-xs text-amber-200">
                  {t("validation.offlineConflictHint")}
                </span>
              </div>
            )}

            <section className="mt-5 rounded-xl border border-white/10 bg-black/15 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    {t("validation.yourScans")}
                  </p>
                  <h2 className="mt-1 text-3xl font-bold">
                    {scanHistoryLoading ? "–" : scanHistory.totalScans}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("validation.scansForEvent")}
                  </p>
                </div>
                <IconButton label={t("validation.openScanHistory")} tone="primary" onClick={()=>setScanHistoryOpen(true)}><History aria-hidden className="h-5 w-5"/></IconButton>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                {t("validation.scanHistoryHint")}
              </p>
            </section>
          </section>);
}
