"use client";

import { Copy, Loader2, Link2, Trash2 } from "lucide-react";

import { formatEventDateTime } from "@/features/events/dateFormat";
import { ActionButton as UIActionButton } from '@/components/ui/ActionButton';
import { Input as UIInput } from '@/components/ui/Field';

import type { TicketValidationWorkspaceModel } from "../useTicketValidation";

export function ValidationAccessPanel({model}: {model: Pick<TicketValidationWorkspaceModel, "copyScannerAccess" | "createScannerAccess" | "creatingScannerAccess" | "latestScannerAccess" | "revokeScannerAccess" | "scannerAccessLoading" | "scannerAccesses" | "scannerEndsAt" | "scannerLabel" | "scannerStartsAt" | "selectedEvent" | "setScannerEndsAt" | "setScannerLabel" | "setScannerStartsAt" | "t">}) {
 const { copyScannerAccess, createScannerAccess, creatingScannerAccess, latestScannerAccess, revokeScannerAccess, scannerAccessLoading, scannerAccesses, scannerEndsAt, scannerLabel, scannerStartsAt, selectedEvent, setScannerEndsAt, setScannerLabel, setScannerStartsAt, t }=model;
 if(!selectedEvent)return null;
 return (<section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">
                  {t("validation.quickAccess")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("validation.quickAccessHint", {
                    event: selectedEvent.title,
                  })}
                </p>
              </div>
            </div>

            <form
              onSubmit={createScannerAccess}
              className="mt-5 grid gap-3 md:grid-cols-2"
            >
              <UIInput
                value={scannerLabel}
                onChange={(event) => setScannerLabel(event.target.value)}
                maxLength={80}
                placeholder={t("validation.scannerLabelPlaceholder")}
                required
                className="h-11"
              />
              <div className="hidden md:block" />
              <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
                <span>{t("validation.activeFrom")}</span>
                <UIInput
                  type="datetime-local"
                  value={scannerStartsAt}
                  onChange={(event) => setScannerStartsAt(event.target.value)}
                  required
                  className="h-11 w-full text-foreground"
                />
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-muted-foreground">
                <span>{t("validation.activeUntil")}</span>
                <UIInput
                  type="datetime-local"
                  value={scannerEndsAt}
                  onChange={(event) => setScannerEndsAt(event.target.value)}
                  required
                  className="h-11 w-full text-foreground"
                />
              </label>
              <button
                type="submit"
                disabled={
                  !scannerLabel.trim() ||
                  !scannerStartsAt ||
                  !scannerEndsAt ||
                  creatingScannerAccess
                }
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50 md:col-span-2 md:w-fit"
              >
                {creatingScannerAccess ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                {t("validation.createLink")}
              </button>
            </form>

            {latestScannerAccess && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/[0.07] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">
                    {latestScannerAccess.label}
                  </p>
                  <UIActionButton
                    type="button"
                    onClick={() =>
                      void copyScannerAccess(latestScannerAccess.url)
                    }
                    className="inline-flex h-9 shrink-0 items-center gap-2 px-3 text-xs font-semibold"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t("validation.copy")}
                  </UIActionButton>
                </div>
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                  {latestScannerAccess.url}
                </p>
              </div>
            )}

            <div className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10">
              {scannerAccessLoading ? (
                <div className="flex h-16 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : scannerAccesses.length ? (
                scannerAccesses.map((access) => (
                  <div
                    key={access.id}
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    <div
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${access.revokedAt ? "bg-white/5 text-muted-foreground" : "bg-primary/10 text-primary"}`}
                    >
                      <Link2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {access.label}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatEventDateTime(access.startsAt)} -{" "}
                        {formatEventDateTime(access.endsAt)}
                      </p>
                    </div>
                    {access.revokedAt ? (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {t("validation.revoked")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void revokeScannerAccess(access)}
                        aria-label={t("validation.revoke", {
                          label: access.label,
                        })}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {t("validation.noLinks")}
                </p>
              )}
            </div>
          </section>);
}
