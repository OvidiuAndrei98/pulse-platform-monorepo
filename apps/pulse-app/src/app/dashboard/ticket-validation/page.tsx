"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Loader2,
  Link2,
  MailPlus,
  ScanLine,
  ShieldCheck,
  Ticket,
  Trash2,
  UserRoundCheck,
  UsersRound,
  Download,
  RefreshCw,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { ApiClient, ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { OrganizerProfile, ValidationEvent } from "@/core/DataProvider";
import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";
import { formatEventDateTime } from "@/features/events/dateFormat";
import { useTranslation } from "react-i18next";
import {
  applyOfflineSyncResults,
  clearExpiredOfflineData,
  clearOfflineEventData,
  getOfflineDeviceId,
  getOfflineConflictScans,
  getOfflineValidationEvents,
  getOfflineValidationState,
  getPendingOfflineScans,
  recordOfflineTicketScan,
  saveOfflineSnapshot,
  type OfflineTicketScan,
} from "@/features/tickets/offlineValidationStore";

const ORGANIZER_AGREEMENT_VERSION = "2026-07-27-glow";
const apiHealthUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1")
  .replace(/\/api\/v1\/?$/, "/health");

type ValidationStaff = ReadableSchema<"ValidationStaffResponse">;
type TicketValidation = ReadableSchema<"TicketValidationResponse">;
type ScannerAccess = ReadableSchema<"ScannerAccessResponse">;
type CreatedScannerAccess = ReadableSchema<"CreateScannerAccessResponse">;
type OfflineSnapshotResponse = ReadableSchema<"OfflineValidationSnapshotResponse">;
type OfflineSyncResponse = ReadableSchema<"SyncOfflineTicketScansResponse">;
type ScannerResult = TicketValidation | {
  status: "offline_valid" | "offline_duplicate" | "offline_unknown" | "offline_expired" | "offline_unprepared";
  ticketType?: string;
  eventTitle?: string;
};

function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function TicketValidationPage() {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const isOrganizer = user?.properties.role === "organizer" || user?.properties.role === "admin";
  const [profile, setProfile] = useState<OrganizerProfile>();
  const [profileLoading, setProfileLoading] = useState(isOrganizer);
  const [companyName, setCompanyName] = useState("");
  const [cui, setCui] = useState("");
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [events, setEvents] = useState<ValidationEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventMenuOpen, setEventMenuOpen] = useState(false);
  const [validationHash, setValidationHash] = useState("");
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ScannerResult>();
  const [staff, setStaff] = useState<ValidationStaff[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffEmail, setStaffEmail] = useState("");
  const [savingStaff, setSavingStaff] = useState(false);
  const [scannerAccesses, setScannerAccesses] = useState<ScannerAccess[]>([]);
  const [scannerAccessLoading, setScannerAccessLoading] = useState(false);
  const [scannerLabel, setScannerLabel] = useState("Gate 1 Scanner");
  const [scannerStartsAt, setScannerStartsAt] = useState("");
  const [scannerEndsAt, setScannerEndsAt] = useState("");
  const [creatingScannerAccess, setCreatingScannerAccess] = useState(false);
  const [latestScannerAccess, setLatestScannerAccess] = useState<CreatedScannerAccess>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [offlineSnapshot, setOfflineSnapshot] = useState<OfflineSnapshotResponse>();
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [offlineConflicts, setOfflineConflicts] = useState<OfflineTicketScan[]>([]);
  const [showOfflineConflicts, setShowOfflineConflicts] = useState(false);
  const [preparingOffline, setPreparingOffline] = useState(false);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const selectedEventIdRef = useRef(selectedEventId);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );

  const refreshConnectionStatus = async () => {
    if (!navigator.onLine) {
      setIsOnline(false);
      return false;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetch(apiHealthUrl, {
        cache: "no-store",
        signal: controller.signal,
      });
      setIsOnline(response.ok);
      return response.ok;
    } catch {
      setIsOnline(false);
      return false;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const refreshOfflineState = async (eventId = selectedEventId) => {
    if (!user || !eventId) {
      setOfflineSnapshot(undefined);
      setOfflinePendingCount(0);
      setOfflineConflicts([]);
      return;
    }
    const [state, conflicts] = await Promise.all([
      getOfflineValidationState(user.properties.id, eventId),
      getOfflineConflictScans(user.properties.id, eventId),
    ]);
    setOfflineSnapshot(state.snapshot);
    setOfflinePendingCount(state.pendingCount);
    setOfflineConflicts(conflicts);
  };

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
    setShowOfflineConflicts(false);
  }, [selectedEventId]);

  const syncOfflineScans = async (eventId = selectedEventId) => {
    if (!user || !eventId || !isOnline) return;
    const state = await getOfflineValidationState(user.properties.id, eventId);
    if (!state.snapshot || state.pendingCount === 0) return;

    setSyncingOffline(true);
    try {
      const scans = await getPendingOfflineScans(user.properties.id, eventId);
      if (!scans.length) return;
      const response = await ApiClient.instance.post(
        "/dashboard/ticket-validation/events/{id}/offline-sync",
        {
          params: { path: { id: eventId } },
          body: {
            snapshotId: state.snapshot.snapshotId,
            deviceId: await getOfflineDeviceId(),
            scans: scans.map((scan) => ({
              clientScanId: scan.clientScanId,
              validationHash: scan.validationHash,
              scannedAt: scan.scannedAt,
            })),
          },
        },
      ) as OfflineSyncResponse;
      await applyOfflineSyncResults(user.properties.id, eventId, response.results);
      await refreshOfflineState(eventId);
      const conflicts = response.results.filter((item) => item.status !== "accepted").length;
      setNotice(conflicts ? t("validation.offlineSyncConflicts", { count: conflicts }) : t("validation.offlineSyncComplete"));
    } catch {
      setError(t("validation.offlineSyncFailed"));
    } finally {
      setSyncingOffline(false);
    }
  };

  const prepareOffline = async () => {
    if (!user || !selectedEventId || !isOnline) return;
    setPreparingOffline(true);
    setError("");
    setNotice("");
    try {
      const snapshot = await ApiClient.instance.post(
        "/dashboard/ticket-validation/events/{id}/offline-snapshot",
        { params: { path: { id: selectedEventId } } },
      ) as OfflineSnapshotResponse;
      await saveOfflineSnapshot(user.properties.id, snapshot, selectedEvent);
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const assets = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(window.location.origin + "/_next/"));
        const cache = await caches.open("glow-offline-scanner-v2");
        const pageResponse = await fetch("/dashboard/ticket-validation", { cache: "reload" });
        if (pageResponse.ok) {
          await cache.put("/dashboard/ticket-validation", pageResponse.clone());
        }
        await Promise.all(
          assets.map(async (url) => {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          }),
        );
        registration.active?.postMessage({
          type: "PREPARE_OFFLINE_SCANNER",
          assets,
        });
      }
      await refreshOfflineState();
      setNotice(t("validation.offlinePrepared", { count: snapshot.ticketCount }));
    } catch {
      setError(t("validation.offlinePrepareFailed"));
    } finally {
      setPreparingOffline(false);
    }
  };

  const removeOfflineData = async () => {
    if (!user || !selectedEventId) return;
    await clearOfflineEventData(user.properties.id, selectedEventId);
    await refreshOfflineState();
    setNotice(t("validation.offlineRemoved"));
  };

  const loadStaff = async (eventId: string) => {
    setStaffLoading(true);
    try {
      const response = await ApiClient.instance.get(
        "/dashboard/ticket-validation/events/{id}/staff",
        { params: { path: { id: eventId } } },
      );
      if (selectedEventIdRef.current === eventId) setStaff(response);
    } catch {
      setError(t("validation.staffLoadFailed"));
    } finally {
      setStaffLoading(false);
    }
  };

  const loadScannerAccesses = async (eventId: string) => {
    setScannerAccessLoading(true);
    try {
      const response = await ApiClient.instance.get(
        "/dashboard/ticket-validation/events/{id}/quick-access",
        { params: { path: { id: eventId } } },
      );
      if (selectedEventIdRef.current === eventId) setScannerAccesses(response);
    } catch {
      setError(t("validation.linksLoadFailed"));
    } finally {
      setScannerAccessLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    let cancelled = false;

    async function load() {
      setEventsLoading(true);
      try {
        const response = await currentUser.getValidationEvents();
        if (cancelled) return;
        setEvents(response);
        setSelectedEventId((current) => current || response[0]?.id || "");
      } catch {
        const offlineEvents = await getOfflineValidationEvents(currentUser.properties.id);
        if (cancelled) return;
        if (offlineEvents.length) {
          setEvents(offlineEvents);
          setSelectedEventId((current) => current || offlineEvents[0].id);
        } else {
          setError(t("validation.eventsLoadFailed"));
        }
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !isOrganizer) {
      setProfileLoading(false);
      return;
    }
    const currentUser = user;

    async function loadProfile() {
      setProfileLoading(true);
      try {
        setProfile(await currentUser.getOrganizerProfile());
      } catch {
        setProfile(undefined);
      } finally {
        setProfileLoading(false);
      }
    }

    void loadProfile();
  }, [isOrganizer, user]);

  useEffect(() => {
    setStaff([]);
    setStaffEmail("");
    setScannerAccesses([]);
    setLatestScannerAccess(undefined);
    if (!selectedEvent?.canManage) return;
    setScannerStartsAt(toDateTimeLocal(selectedEvent.startTime));
    setScannerEndsAt(toDateTimeLocal(selectedEvent.endTime));
    void loadStaff(selectedEvent.id);
    void loadScannerAccesses(selectedEvent.id);
  }, [selectedEvent?.canManage, selectedEvent?.id]);

  useEffect(() => {
    void clearExpiredOfflineData();
    void refreshOfflineState();
  }, [selectedEventId, user?.properties.id]);

  useEffect(() => {
    void refreshConnectionStatus();
    const goOnline = () => {
      void refreshConnectionStatus().then((connected) => {
        if (connected) void syncOfflineScans();
      });
    };
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [selectedEventId, user?.properties.id]);

  const submitCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !cui.trim() || !companyName.trim() || !agreementAccepted) return;
    setSubmittingProfile(true);
    setError("");
    try {
      setProfile(await user.updateOrganizerProfile(cui.trim(), companyName.trim(), ORGANIZER_AGREEMENT_VERSION));
      setNotice(t("validation.companySubmitted"));
    } catch {
      setError(t("validation.companyFailed"));
    } finally {
      setSubmittingProfile(false);
    }
  };

  const validateOfflineTicket = async (hash: string) => {
    if (!user || !selectedEventId) return;
    const offlineResult = await recordOfflineTicketScan(user.properties.id, selectedEventId, hash);
    switch (offlineResult.status) {
      case "accepted":
        setResult({ status: "offline_valid", ticketType: offlineResult.scan.ticketType, eventTitle: selectedEvent?.title });
        break;
      case "duplicate":
        setResult({ status: "offline_duplicate", ticketType: offlineResult.scan.ticketType, eventTitle: selectedEvent?.title });
        break;
      case "unknown":
        setResult({ status: "offline_unknown" });
        break;
      case "expired":
        setResult({ status: "offline_expired" });
        break;
      default:
        setResult({ status: "offline_unprepared" });
    }
    setValidationHash("");
    await refreshOfflineState();
  };

  const submitValidationHash = async (hash: string) => {
    if (!selectedEventId || !hash.trim()) return;
    setValidating(true);
    setError("");
    setNotice("");
    setResult(undefined);
    if (!isOnline) {
      await validateOfflineTicket(hash);
      setValidating(false);
      return;
    }
    try {
      const response = await ApiClient.instance.post(
        "/dashboard/ticket-validation/events/{id}/tickets/validate",
        {
          params: { path: { id: selectedEventId } },
          body: { validationHash: hash.trim() },
        },
      );
      setResult(response);
      setValidationHash("");
    } catch (scanError) {
      if (!isOnline || scanError instanceof TypeError) {
        await validateOfflineTicket(hash);
      } else {
        setError(t("validation.invalidTicket"));
      }
    } finally {
      setValidating(false);
    }
  };

  const validateTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitValidationHash(validationHash);
  };

  const addStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEvent || !staffEmail.trim()) return;
    setSavingStaff(true);
    setError("");
    setNotice("");
    try {
      await ApiClient.instance.post("/dashboard/ticket-validation/events/{id}/staff", {
        params: { path: { id: selectedEvent.id } },
        body: { email: staffEmail.trim() },
      });
      setStaffEmail("");
      setNotice(t("validation.staffAdded"));
      await loadStaff(selectedEvent.id);
    } catch {
      setError(t("validation.staffAddFailed"));
    } finally {
      setSavingStaff(false);
    }
  };

  const removeStaff = async (member: ValidationStaff) => {
    if (!selectedEvent) return;
    setError("");
    setNotice("");
    try {
      await ApiClient.instance.delete("/dashboard/ticket-validation/events/{id}/staff/{userId}", {
        params: { path: { id: selectedEvent.id, userId: member.id } },
      });
      setStaff((current) => current.filter((item) => item.id !== member.id));
      setNotice(t("validation.staffRemoved"));
    } catch {
      setError(t("validation.staffRemoveFailed"));
    }
  };

  const createScannerAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedEvent || !scannerLabel.trim() || !scannerStartsAt || !scannerEndsAt) return;
    setCreatingScannerAccess(true);
    setError("");
    setNotice("");
    try {
      const response = await ApiClient.instance.post(
        "/dashboard/ticket-validation/events/{id}/quick-access",
        {
          params: { path: { id: selectedEvent.id } },
          body: {
            label: scannerLabel.trim(),
            startsAt: new Date(scannerStartsAt).toISOString(),
            endsAt: new Date(scannerEndsAt).toISOString(),
          },
        },
      );
      setLatestScannerAccess(response);
      setNotice(t("validation.linkCreated"));
      await loadScannerAccesses(selectedEvent.id);
    } catch {
      setError(t("validation.linkCreateFailed"));
    } finally {
      setCreatingScannerAccess(false);
    }
  };

  const copyScannerAccess = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice(t("validation.linkCopied"));
    } catch {
      setError(t("validation.linkCopyFailed"));
    }
  };

  const revokeScannerAccess = async (access: ScannerAccess) => {
    if (!selectedEvent) return;
    setError("");
    setNotice("");
    try {
      await ApiClient.instance.delete(
        "/dashboard/ticket-validation/events/{id}/quick-access/{accessId}",
        { params: { path: { id: selectedEvent.id, accessId: access.id } } },
      );
      setScannerAccesses((current) => current.map((item) => item.id === access.id ? { ...item, revokedAt: new Date().toISOString() } : item));
      setNotice(t("validation.linkRevoked"));
    } catch {
      setError(t("validation.linkRevokeFailed"));
    }
  };

  const companyReady = profile?.verificationStatus === "approved";

  return (
    <main className="min-h-screen pb-20 text-foreground">
      <div className="mx-auto max-w-5xl space-y-6 px-4 pt-7 sm:px-6 sm:pt-9">
        <header className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">{t("validation.eventAccess")}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">{t("validation.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("validation.subtitle")}</p>
        </header>

        <section className="rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t("validation.configureEvent")}</p>
          <div className="relative mt-3">
            <button type="button" onClick={() => setEventMenuOpen((open) => !open)} disabled={eventsLoading} className="flex h-11 w-full items-center justify-between rounded-lg border border-white/15 bg-background/60 px-3 text-left text-sm transition hover:bg-white/[0.08] disabled:opacity-50">
              <span className={selectedEvent ? "truncate" : "text-muted-foreground"}>{selectedEvent?.title || (eventsLoading ? t("validation.loadingEvents") : t("validation.chooseEvent"))}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition ${eventMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {eventMenuOpen && (
              <div className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-lg border border-white/15 bg-background p-1 shadow-xl">
                {events.map((event) => (
                  <button key={event.id} type="button" onClick={() => { setSelectedEventId(event.id); setEventMenuOpen(false); setResult(undefined); }} className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition hover:bg-white/5 ${event.id === selectedEventId ? "bg-primary/10 text-primary" : ""}`}>
                    <Ticket className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{event.title}</span>
                    {event.canManage && <span className="text-[10px] font-semibold uppercase text-muted-foreground">{t("validation.organizer")}</span>}
                  </button>
                ))}
                {!events.length && !eventsLoading && <p className="px-3 py-3 text-sm text-muted-foreground">{t("validation.noAssignedEvents")}</p>}
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("validation.scopeHint")}</p>
        </section>

        {isOrganizer && (profileLoading ? (
          <div className="h-28 animate-pulse rounded-xl border border-white/10 bg-white/5" />
        ) : !companyReady ? (
          <section className="rounded-xl border border-amber-400/25 bg-amber-400/[0.04] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-300" />
              <div>
                <h2 className="text-base font-semibold">{t("validation.companyVerification")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("validation.companyHint")}</p>
              </div>
            </div>
            {profile?.verificationStatus === "pending" ? (
              <p className="mt-5 text-sm text-amber-200">{t("validation.companyPending")}</p>
            ) : (
              <form onSubmit={submitCompany} className="mt-5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                <input value={cui} onChange={(event) => setCui(event.target.value)} placeholder={t("validation.cui")} required className="h-11 rounded-lg border border-white/15 bg-black/20 px-3 text-sm outline-none focus:border-primary/60" />
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder={t("validation.companyName")} required className="h-11 rounded-lg border border-white/15 bg-black/20 px-3 text-sm outline-none focus:border-primary/60" />
                <button type="submit" disabled={submittingProfile || !agreementAccepted} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {submittingProfile && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("validation.verify")}
                </button>
                </div>
                <label className="flex cursor-pointer items-start gap-3 border border-white/10 bg-black/10 p-3 text-xs leading-5 text-muted-foreground">
                  <input type="checkbox" checked={agreementAccepted} onChange={(event) => setAgreementAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]" />
                  <span>{t("validation.agreementPrefix")} <a href="/organizers/agreement" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">{t("validation.agreementLink")}</a>{t("validation.agreementSuffix")}</span>
                </label>
              </form>
            )}
          </section>
        ) : (
          <section className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div><p className="text-sm font-semibold">{profile.companyName}</p><p className="text-xs text-muted-foreground">{t("validation.verifiedCompany", { cui: profile.cui })}</p></div>
          </section>
        ))}

        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <ScanLine className="mt-0.5 h-5 w-5 text-primary" />
            <div><h2 className="text-base font-semibold">{t("validation.verifyTicket")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("validation.ticketHint")}</p></div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 p-3">
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {isOnline ? <Wifi className="h-4 w-4 shrink-0 text-primary" /> : <WifiOff className="h-4 w-4 shrink-0 text-amber-300" />}
              <span>{isOnline ? t("validation.online") : t("validation.offline")}</span>
              {offlineSnapshot && <span className="truncate text-foreground/80">{t("validation.offlineReady", { count: offlineSnapshot.ticketCount })}</span>}
              {offlinePendingCount > 0 && <span className="font-semibold text-amber-200">{t("validation.offlinePending", { count: offlinePendingCount })}</span>}
            </div>
            <div className="flex items-center gap-2">
              {offlineSnapshot && <button type="button" onClick={() => void removeOfflineData()} className="h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-muted-foreground transition hover:bg-white/5">{t("validation.offlineRemove")}</button>}
              <button type="button" onClick={() => void (offlinePendingCount ? syncOfflineScans() : prepareOffline())} disabled={!selectedEventId || !isOnline || preparingOffline || syncingOffline} className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
                {preparingOffline || syncingOffline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : offlinePendingCount ? <RefreshCw className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                {offlinePendingCount ? t("validation.syncNow") : t("validation.prepareOffline")}
              </button>
            </div>
            <p className="basis-full text-[11px] leading-4 text-muted-foreground">{t("validation.offlineHint")}</p>
          </div>

          {offlineConflicts.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-amber-100">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                  <span className="truncate">{t("validation.offlineConflictsTitle", { count: offlineConflicts.length })}</span>
                </div>
                <button type="button" onClick={() => setShowOfflineConflicts((visible) => !visible)} className="shrink-0 text-xs font-semibold text-amber-200 underline-offset-2 hover:underline">
                  {showOfflineConflicts ? t("validation.hideConflicts") : t("validation.viewConflicts")}
                </button>
              </div>
              {showOfflineConflicts && <div className="mt-2 max-h-52 divide-y divide-amber-100/10 overflow-y-auto pr-1">
                {offlineConflicts.map((scan) => (
                  <div key={scan.clientScanId} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <div className="min-w-0"><p className="truncate font-semibold text-foreground">{scan.ticketType}</p><p className="text-muted-foreground">{formatEventDateTime(scan.scannedAt)}</p></div>
                    <span className="shrink-0 text-right text-amber-200">{t(`validation.offlineConflict.${scan.serverStatus || "invalid"}`)}</span>
                  </div>
                ))}
              </div>}
            </div>
          )}

          <form onSubmit={validateTicket} className="mt-4 space-y-3">
            <textarea value={validationHash} onChange={(event) => setValidationHash(event.target.value)} rows={3} placeholder={t("validation.pasteQr")} className="w-full resize-none rounded-lg border border-white/15 bg-white/5 p-3 font-mono text-xs outline-none transition placeholder:font-sans placeholder:text-sm focus:border-primary/60" />
            <QrCameraScanner disabled={!selectedEventId || validating} onScan={(value) => void submitValidationHash(value)} />
            <button type="submit" disabled={!selectedEventId || !validationHash.trim() || validating} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 sm:w-auto">
              {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              {validating ? t("scanner.validating") : t("scanner.validate")}
            </button>
          </form>

          {result && (
            <div className={`mt-5 flex gap-3 rounded-lg border p-4 ${result.status === "valid" || result.status === "offline_valid" ? "border-primary/30 bg-primary/10" : "border-amber-400/30 bg-amber-400/10"}`}>
              {result.status === "valid" || result.status === "offline_valid" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" /> : <XCircle className="mt-0.5 h-5 w-5 text-amber-300" />}
              <div><p className="text-sm font-semibold">{
                result.status === "valid" ? t("scanner.validTicket") :
                result.status === "offline_valid" ? t("validation.offlineValid") :
                result.status === "offline_duplicate" ? t("validation.offlineDuplicate") :
                result.status === "offline_unknown" ? t("validation.offlineUnknown") :
                result.status === "offline_expired" ? t("validation.offlineExpired") :
                result.status === "offline_unprepared" ? t("validation.offlineUnprepared") : t("scanner.usedTicket")
              }</p>{result.ticketType && <p className="mt-1 text-xs text-muted-foreground">{result.ticketType} - {result.eventTitle}</p>}</div>
            </div>
          )}
        </section>

        {selectedEvent?.canManage && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <UsersRound className="mt-0.5 h-5 w-5 text-primary" />
              <div><h2 className="text-base font-semibold">{t("validation.validationTeam")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("validation.staffHint", { event: selectedEvent.title })}</p></div>
            </div>

            <form onSubmit={addStaff} className="mt-5 flex flex-col gap-2 sm:flex-row">
              <input type="email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} placeholder={t("validation.staffEmailPlaceholder")} required className="h-11 min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 text-sm outline-none focus:border-primary/60" />
              <button type="submit" disabled={!staffEmail.trim() || savingStaff} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50">
                {savingStaff ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />}
                {t("validation.addAccess")}
              </button>
            </form>

            <div className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10">
              {staffLoading ? (
                <div className="flex h-16 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : staff.length ? staff.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-3 py-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserRoundCheck className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.username}</p><p className="truncate text-xs text-muted-foreground">{member.email}</p></div>
                  <button type="button" onClick={() => void removeStaff(member)} aria-label={t("validation.removeAccess", { name: member.username })} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              )) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">{t("validation.onlyYou")}</p>
              )}
            </div>
          </section>
        )}

        {selectedEvent?.canManage && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">{t("validation.quickAccess")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("validation.quickAccessHint", { event: selectedEvent.title })}</p>
              </div>
            </div>

            <form onSubmit={createScannerAccess} className="mt-5 grid gap-3 md:grid-cols-2">
              <input value={scannerLabel} onChange={(event) => setScannerLabel(event.target.value)} maxLength={80} placeholder={t("validation.scannerLabelPlaceholder")} required className="h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-sm outline-none focus:border-primary/60" />
              <div className="hidden md:block" />
              <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>{t("validation.activeFrom")}</span><input type="datetime-local" value={scannerStartsAt} onChange={(event) => setScannerStartsAt(event.target.value)} required className="h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-foreground outline-none focus:border-primary/60" /></label>
              <label className="space-y-1.5 text-xs font-semibold text-muted-foreground"><span>{t("validation.activeUntil")}</span><input type="datetime-local" value={scannerEndsAt} onChange={(event) => setScannerEndsAt(event.target.value)} required className="h-11 w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-foreground outline-none focus:border-primary/60" /></label>
              <button type="submit" disabled={!scannerLabel.trim() || !scannerStartsAt || !scannerEndsAt || creatingScannerAccess} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50 md:col-span-2 md:w-fit">
                {creatingScannerAccess ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                Genereaza link
              </button>
            </form>

            {latestScannerAccess && (
              <div className="mt-4 rounded-lg border border-primary/30 bg-primary/[0.07] p-3">
                <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{latestScannerAccess.label}</p><button type="button" onClick={() => void copyScannerAccess(latestScannerAccess.url)} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"><Copy className="h-3.5 w-3.5" />{t("validation.copy")}</button></div>
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{latestScannerAccess.url}</p>
              </div>
            )}

            <div className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10">
              {scannerAccessLoading ? (
                <div className="flex h-16 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
              ) : scannerAccesses.length ? scannerAccesses.map((access) => (
                  <div key={access.id} className="flex items-center gap-3 px-3 py-3">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${access.revokedAt ? "bg-white/5 text-muted-foreground" : "bg-primary/10 text-primary"}`}><Link2 className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{access.label}</p><p className="truncate text-xs text-muted-foreground">{formatEventDateTime(access.startsAt)} - {formatEventDateTime(access.endsAt)}</p></div>
                  {access.revokedAt ? <span className="text-xs font-semibold text-muted-foreground">{t("validation.revoked")}</span> : <button type="button" onClick={() => void revokeScannerAccess(access)} aria-label={t("validation.revoke", { label: access.label })} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}
                </div>
              )) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">{t("validation.noLinks")}</p>
              )}
            </div>
          </section>
        )}

        {notice && <p className="text-sm text-primary">{notice}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </main>
  );
}
