"use client";
import { ScannerResultFeedback } from "@/features/scanner/presentation/ScannerResultFeedback";
import { ValidationCompanySetup } from "../../../features/scanner/presentation/ValidationCompanySetup";
import { ValidationScanPanel } from "../../../features/scanner/presentation/ValidationScanPanel";
import { ValidationStaffPanel } from "../../../features/scanner/presentation/ValidationStaffPanel";
import { ValidationAccessPanel } from "../../../features/scanner/presentation/ValidationAccessPanel";

import { useTicketValidation } from "../../../features/scanner/useTicketValidation";
import { ScannerResult } from "../../../features/scanner/useTicketValidation.contracts";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ArrowLeft, CalendarDays, ChevronRight, MapPin, Loader2, ShieldCheck, Ticket, RefreshCw, Wifi, WifiOff, X } from "lucide-react";

import { useDataProvider } from "@/core/DataProviderContext";
import { WardrobeTabs as SectionTabs } from "@/features/wardrobe/WardrobeTabs";

import { formatEventDateTime } from "@/features/events/dateFormat";

import { ActionButton as UIActionButton } from '@/components/ui/ActionButton';
import { Input as UIInput } from '@/components/ui/Field';

export default function TicketValidationPage() {
  const { user } = useDataProvider();
  return <TicketValidationAccount key={user?.properties.id} />;
}

function TicketValidationAccount() {
  const [selectedEventId, setSelectedEventId] = useState("");
  return <TicketValidationWorkspace key={selectedEventId}
    selectedEventId={selectedEventId} setSelectedEventId={setSelectedEventId} />;
}

function TicketValidationWorkspace(props: Parameters<typeof useTicketValidation>[0]) {
  const model = useTicketValidation(props);
  const {
    agreementAccepted,
    companyName,
    companyReady,
    creatingScannerAccess,
    cui,
    error,
    eventHeading,
    events,
    eventsLoading,
    i18n,
    isOnline,
    isOrganizer,
    notice,
    preparingOffline,
    profile,
    profileLoading,
    result,
    retryCompanyVerification,
    savingStaff,
    scanHistory,
    scanHistoryLoading,
    scanHistoryOpen,
    selectedEvent,
    selectedEventId,
    setActiveTab,
    setAgreementAccepted,
    setCompanyName,
    setCui,
    setError,
    setReload,
    setScanHistoryOpen,
    setSelectedEventId,
    submitCompany,
    submittingProfile,
    syncingOffline,
    t,
    validating,
    validationTab,
  } = model;

  if (isOrganizer && !profileLoading && !companyReady) {
    return (
      <main className="text-foreground pb-[110px]">
        <div className="app-page-spacing mx-auto max-w-2xl">
          <ValidationCompanySetup model={model} />
        </div>
      </main>
    );
  }

  if (!selectedEvent) return (
    <main className="text-foreground pb-[110px]">
      <div className="app-page-spacing mx-auto max-w-5xl space-y-6" data-testid="validation-event-list">
        <header className="space-y-2">
          <h1 ref={eventHeading} tabIndex={-1} className="text-2xl font-bold outline-none sm:text-3xl">{t("validation.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("validation.eventListHint")}</p>
        </header>
        {eventsLoading || profileLoading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 animate-spin" />{t("validation.loadingEvents")}</p>
        ) : <>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">{t("validation.chooseEvent")}</h2>
            <UIActionButton type="button" aria-label={t("validation.refreshEvents")} onClick={() => { setError(""); setReload(value => value + 1); }}
              className="inline-flex min-h-11 min-w-11 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"><RefreshCw aria-hidden="true" className="size-4" /></UIActionButton>
          </div>
          {!events.length && !error && <p className="rounded-xl border border-white/10 p-5 text-sm text-muted-foreground">{t("validation.noAssignedEvents")}</p>}
          <ul className="space-y-3">
            {events.map(event => <li key={event.id}>
              <button type="button" data-testid={`validation-event-${event.id}`} onClick={() => setSelectedEventId(event.id)}
                className="flex min-h-24 w-full items-center gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 text-start transition hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Ticket aria-hidden="true" className="size-5" /></span>
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="block break-words font-semibold">{event.title}</span>
                  <span className="flex items-start gap-2 text-sm text-muted-foreground"><CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{formatEventDateTime(event.startTime)}</span></span>
                  {event.locationName && <span className="flex items-start gap-2 text-sm text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words">{event.locationName}</span></span>}
                  <span className="block text-xs text-primary">{Date.parse(event.endTime) <= Date.now() ? t("validation.offlineJournal") : event.canManage ? t("validation.organizer") : t("validation.scanAccess")}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-primary" />
              </button>
            </li>)}
          </ul>
        </>}
      </div>
    </main>
  );

  return (
    <main className="text-foreground pb-[110px]">
      <div className="app-page-spacing mx-auto max-w-5xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold sm:text-3xl">
              {t("validation.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("validation.subtitle")}
            </p>
          </div>
          <span
            className={`mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${isOnline ? "border-primary/35 bg-primary/10 text-primary" : "border-amber-300/35 bg-amber-300/10 text-amber-200"}`}
          >
            {isOnline ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            {isOnline ? t("validation.online") : t("validation.offline")}
          </span>
        </header>

        <section className="space-y-3" data-testid="validation-selected-event">
          <button type="button" data-testid="validation-change-event" onClick={() => setSelectedEventId("")}
            disabled={validating || preparingOffline || syncingOffline || savingStaff || creatingScannerAccess}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 text-sm font-medium text-foreground transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t("validation.changeEvent")}
          </button>
          <h2 tabIndex={-1} ref={eventHeading} className="break-words text-xl font-semibold">{selectedEvent?.title}</h2>
          <p className="break-words text-sm text-muted-foreground">{selectedEvent && formatEventDateTime(selectedEvent.startTime)} · {selectedEvent?.locationName}</p>
        </section>

        <SectionTabs id="validation-tabs" panelId="validation-panel"
          label={t("validation.title")} ro={i18n.language.startsWith("ro")}
          value={validationTab} onChange={setActiveTab}
          options={[
            { value: "scan", label: t("validation.scanTab") },
            ...(selectedEvent?.canManage ? [
              { value: "team" as const, label: t("validation.validationTeam") },
              { value: "links" as const, label: t("validation.quickAccess") },
            ] : []),
          ]} />
        <section id="validation-panel" role="tabpanel" aria-labelledby={'validation-tabs-'+validationTab} className="min-w-0 space-y-6">

        {validationTab !== "scan" && selectedEvent?.canManage &&
          isOrganizer &&
          (profileLoading ? (
            <div className="h-28 animate-pulse rounded-xl border border-white/10 bg-white/5" />
          ) : !companyReady ? (
            <section className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-300" />
                <div>
                  <h2 className="text-base font-semibold">
                    {t("validation.companyVerification")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("validation.companyHint")}
                  </p>
                </div>
              </div>
              {profile?.verificationStatus === "pending" ? (
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-amber-200">
                    {t("validation.companyPending")}
                  </p>
                  <button
                    type="button"
                    onClick={retryCompanyVerification}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/30 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/10"
                  >
                    {t("validation.verifyAgain")}
                  </button>
                </div>
              ) : (
                <form onSubmit={submitCompany} className="mt-5 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                    <UIInput
                      value={cui}
                      onChange={(event) => setCui(event.target.value)}
                      placeholder={t("validation.cui")}
                      required
                      className="h-11"
                    />
                    <UIInput
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder={t("validation.companyName")}
                      required
                      className="h-11"
                    />
                    <UIActionButton
                      type="submit"
                      disabled={submittingProfile || !agreementAccepted}
                      className="inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-semibold disabled:opacity-50"
                    >
                      {submittingProfile && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {t("validation.verify")}
                    </UIActionButton>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 border border-white/10 bg-black/10 p-3 text-xs leading-5 text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={agreementAccepted}
                      onChange={(event) =>
                        setAgreementAccepted(event.target.checked)
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span>
                      {t("validation.agreementPrefix")}{" "}
                      <a
                        href="/organizers/agreement"
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-primary hover:underline"
                      >
                        {t("validation.agreementLink")}
                      </a>
                      {t("validation.agreementSuffix")}
                    </span>
                  </label>
                </form>
              )}
            </section>
          ) : (
            profile && <section className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">{profile.companyName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("validation.verifiedCompany", { cui: profile.cui })}
                </p>
              </div>
            </section>
          ))}

        {validationTab === "scan" && (
          <ValidationScanPanel model={model} />
        )}

        {validationTab === "team" && selectedEvent?.canManage && (
          <ValidationStaffPanel model={model} />
        )}

        {validationTab === "links" && selectedEvent?.canManage && (
          <ValidationAccessPanel model={model} />
        )}

        </section>
        {notice && <p className="text-sm text-primary">{notice}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
      <AnimatePresence>
        {scanHistoryOpen && (
          <>
            <motion.button
              type="button"
              aria-label={t("common.close")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setScanHistoryOpen(false)}
              className="fixed inset-0 z-[220] bg-black/65 backdrop-blur-sm"
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={t("validation.scanHistory")}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 right-0 z-[221] flex w-full max-w-md flex-col border-l border-white/10 bg-[#0b0e0c] shadow-2xl"
            >
              <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 pb-5 pt-[max(1.25rem,calc(var(--native-safe-top)+1rem))]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                    {t("validation.yourScans")}
                  </p>
                  <h2 className="mt-1 text-xl font-bold">
                    {t("validation.scanHistory")}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("validation.scansForEvent")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScanHistoryOpen(false)}
                  aria-label={t("common.close")}
                  className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="border-b border-white/10 px-5 py-5">
                <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                    {t("validation.totalScans")}
                  </p>
                  <p className="mt-1 text-4xl font-bold">
                    {scanHistoryLoading ? "–" : scanHistory.totalScans}
                  </p>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-[max(1.5rem,calc(var(--native-safe-bottom)+1rem))]">
                {scanHistoryLoading ? (
                  <div className="flex h-32 items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : scanHistory.scans.length ? (
                  <div className="space-y-3">
                    {scanHistory.scans.map((scan) => (
                      <article
                        key={scan.ticketId}
                        className="rounded-xl border border-white/10 bg-white/[0.035] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {scan.ticketType}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatEventDateTime(scan.validatedAt)}
                            </p>
                          </div>
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        </div>
                        <p className="mt-3 truncate font-mono text-[11px] text-muted-foreground">
                          {t("validation.ticketId", { id: scan.ticketId })}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("validation.noScansYet")}
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      {result && <ScannerResultToast result={result} />}
    </main>
  );



  function ScannerResultToast({
    result: scanResult,
  }: {
    result: ScannerResult;
  }) {
    return (
      <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[210] mx-auto max-w-md">
        <ScannerResultFeedback result={scanResult} />
      </div>
    );
  }
}
