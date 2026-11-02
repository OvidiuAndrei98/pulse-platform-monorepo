"use client";
import { useEffect, useMemo, useRef, useState } from "react";

import { ApiClient, ApiError } from "@packages/api-client/client";
import { sortValidationEvents } from "@packages/api-client/validation-event-selection";
import { useDataProvider } from "@/core/DataProviderContext";

import { syncPendingScans } from "@/features/tickets/syncOfflineScans";
import { OrganizerProfile, ValidationEvent } from "@/core/DataProvider";

import { useTranslation } from "react-i18next";
import { clearExpiredOfflineData, clearOfflineEventData, getOfflineConflictScans, getOfflineValidationEvents, getOfflineValidationState, recordOfflineTicketScan, saveOfflineSnapshot, type OfflineTicketScan } from "@/features/tickets/offlineValidationStore";

import { ScannerResult, ValidationStaff, ScannerAccess, CreatedScannerAccess, OfflineSnapshotResponse, ValidationScanHistoryResponse, apiHealthUrl, OfflineSyncResponse, isValidationEventActive, toDateTimeLocal, ORGANIZER_AGREEMENT_VERSION } from "./useTicketValidation.contracts";

export function useTicketValidation({ selectedEventId, setSelectedEventId }: {
  selectedEventId: string;
  setSelectedEventId: React.Dispatch<React.SetStateAction<string>>;
}) {

  const { user } = useDataProvider();
  const { t, i18n } = useTranslation();
  const isOrganizer =
    user?.properties.role === "organizer" || user?.properties.role === "admin";
  const [profile, setProfile] = useState<OrganizerProfile>();
  const [profileLoading, setProfileLoading] = useState(isOrganizer);
  const [companyName, setCompanyName] = useState("");
  const [cui, setCui] = useState("");
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [events, setEvents] = useState<ValidationEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const eventHeading = useRef<HTMLHeadingElement>(null);
  const [activeTab, setActiveTab] = useState<"scan" | "team" | "links">("scan");
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
  const [latestScannerAccess, setLatestScannerAccess] =
    useState<CreatedScannerAccess>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [offlineSnapshot, setOfflineSnapshot] =
    useState<OfflineSnapshotResponse>();
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [offlineConflicts, setOfflineConflicts] = useState<OfflineTicketScan[]>(
    [],
  );
  const [preparingOffline, setPreparingOffline] = useState(false);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [scanHistory, setScanHistory] = useState<ValidationScanHistoryResponse>(
    { totalScans: 0, scans: [] },
  );
  const [scanHistoryLoading, setScanHistoryLoading] = useState(false);
  const [scanHistoryOpen, setScanHistoryOpen] = useState(false);
  const selectedEventIdRef = useRef(selectedEventId);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId),
    [events, selectedEventId],
  );
  const validationTab = selectedEvent?.canManage ? activeTab : "scan";
  const admissionsClosed = !!selectedEvent && Date.parse(selectedEvent.endTime) <= Date.now();
  useEffect(() => {
    eventHeading.current?.focus({ preventScroll: true });
  }, [selectedEvent?.id, eventsLoading, profileLoading]);
  useEffect(() => {
    if (!selectedEvent?.canManage) setActiveTab("scan");
  }, [selectedEvent?.canManage]);

  const loadScanHistory = async (eventId = selectedEventId) => {
    if (!eventId) {
      setScanHistory({ totalScans: 0, scans: [] });
      return;
    }
    setScanHistoryLoading(true);
    try {
      const response = (await ApiClient.instance.get(
        "/dashboard/ticket-validation/events/{id}/my-scans" as never,
        { params: { path: { id: eventId } } } as never,
      )) as ValidationScanHistoryResponse;
      if (selectedEventIdRef.current === eventId) setScanHistory(response);
    } catch {
      if (selectedEventIdRef.current === eventId)
        setScanHistory({ totalScans: 0, scans: [] });
    } finally {
      if (selectedEventIdRef.current === eventId) setScanHistoryLoading(false);
    }
  };

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
    if (selectedEventIdRef.current !== eventId) return;
    setOfflineSnapshot(state.snapshot);
    setOfflinePendingCount(state.pendingCount);
    setOfflineConflicts(conflicts);
  };

  useEffect(() => {
    selectedEventIdRef.current = selectedEventId;
  }, [selectedEventId]);

  const syncOfflineScans = async (eventId = selectedEventId) => {
    if (!user || !eventId) return;
    setSyncingOffline(true);
    try {
      const state = await getOfflineValidationState(user.properties.id, eventId);
      if (!state.snapshot || state.pendingCount === 0) return;
      const results = await syncPendingScans(user.properties.id, eventId, async (body) => (await ApiClient.instance.post(
        "/dashboard/ticket-validation/events/{id}/offline-sync",
        {
          params: { path: { id: eventId } },
          body,
        },
      )) as OfflineSyncResponse);
      if (selectedEventIdRef.current !== eventId) return;
      await refreshOfflineState(eventId);
      await loadScanHistory(eventId);
      const conflicts = results.filter(
        (item) => item.status !== "accepted",
      ).length;
      setNotice(
        conflicts
          ? t("validation.offlineSyncConflicts", { count: conflicts })
          : t("validation.offlineSyncComplete"),
      );
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
      const snapshot = (await ApiClient.instance.post(
        "/dashboard/ticket-validation/events/{id}/offline-snapshot",
        { params: { path: { id: selectedEventId } } },
      )) as OfflineSnapshotResponse;
      await saveOfflineSnapshot(user.properties.id, snapshot, selectedEvent);
      // The worker is disabled in development and may be unavailable in a
      // browser. Waiting for `ready` would leave a saved package loading forever.
      const registration = "serviceWorker" in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined;
      if (registration?.active) {
        const assets = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(window.location.origin + "/_next/"));
        const cache = await caches.open("glow-offline-scanner-v3");
        const pageResponse = await fetch("/dashboard/ticket-validation", {
          cache: "reload",
        });
        if (pageResponse.ok)
          await cache.put("/dashboard/ticket-validation", pageResponse.clone());
        await Promise.allSettled(
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
      setNotice(
        t("validation.offlinePrepared", { count: snapshot.ticketCount }),
      );
    } catch {
      setError(t("validation.offlinePrepareFailed"));
    } finally {
      setPreparingOffline(false);
    }
  };

  const removeOfflineData = async () => {
    if (!user || !selectedEventId) return;
    try {
      const removed = await clearOfflineEventData(user.properties.id, selectedEventId);
      await refreshOfflineState();
      if (removed) setNotice(t("validation.offlineRemoved"));
    } catch {
      setError(t("feedback.actionFailed"));
    }
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
      if (selectedEventIdRef.current === eventId)
        setError(t("validation.staffLoadFailed"));
    } finally {
      if (selectedEventIdRef.current === eventId) setStaffLoading(false);
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
      if (selectedEventIdRef.current === eventId)
        setError(t("validation.linksLoadFailed"));
    } finally {
      if (selectedEventIdRef.current === eventId) setScannerAccessLoading(false);
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
        const offlineEvents = await getOfflineValidationEvents(currentUser.properties.id).catch(() => []);
        if (cancelled) return;
        const activeEvents = sortValidationEvents([...new Map([
          ...offlineEvents.map(event => ({ ...event, canManage: false })),
          ...response.filter(isValidationEventActive),
        ].map(event => [event.id, event])).values()]);
        setEvents(activeEvents);
        setSelectedEventId((current) =>
          activeEvents.some((event) => event.id === current)
            ? current
            : "",
        );
      } catch (loadError) {
        if (cancelled) return;
        if (loadError instanceof ApiError && (loadError.status === 401 || loadError.status === 403)) {
          setEvents([]);
          setSelectedEventId("");
          setError(t("validation.eventsLoadFailed"));
          return;
        }
        const offlineEvents = await getOfflineValidationEvents(
          currentUser.properties.id,
        );
        if (cancelled) return;
        const activeOfflineEvents = sortValidationEvents(offlineEvents.map(event => ({ ...event, canManage: false })));
        if (activeOfflineEvents.length) {
          setEvents(activeOfflineEvents);
          setSelectedEventId((current) =>
            activeOfflineEvents.some((event) => event.id === current)
              ? current
              : "",
          );
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
  }, [user, reload]);

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
    void clearExpiredOfflineData().catch(() => setError(t("feedback.actionFailed")));
    void refreshOfflineState().catch(() => setError(t("feedback.actionFailed")));
  }, [selectedEventId, user?.properties.id]);

  useEffect(() => {
    void loadScanHistory();
  }, [selectedEventId, user?.properties.id]);

  useEffect(() => {
    const goOnline = () => {
      void refreshConnectionStatus().then((connected) => {
        if (connected) void syncOfflineScans();
      });
    };
    goOnline();
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [selectedEventId, user?.properties.id]);

  useEffect(() => {
    if (!result) return;
    const timeout = window.setTimeout(() => setResult(undefined), 4_500);
    return () => window.clearTimeout(timeout);
  }, [result]);

  const submitCompany = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !cui.trim() || !companyName.trim() || !agreementAccepted)
      return;
    setSubmittingProfile(true);
    setError("");
    try {
      const updatedProfile = await user.updateOrganizerProfile(
        cui.trim(),
        companyName.trim(),
        ORGANIZER_AGREEMENT_VERSION,
      );
      setProfile(updatedProfile);
      setNotice(
        updatedProfile.verificationStatus === "approved"
          ? t("validation.companyApproved")
          : t("validation.companySubmitted"),
      );
    } catch {
      setError(t("validation.companyFailed"));
    } finally {
      setSubmittingProfile(false);
    }
  };

  const retryCompanyVerification = () => {
    setCui(profile?.cui || "");
    setCompanyName(profile?.companyName || "");
    setProfile(undefined);
    setError("");
    setNotice("");
  };

  const validateOfflineTicket = async (hash: string) => {
    if (!user || !selectedEventId) return;
    const offlineResult = await recordOfflineTicketScan(
      user.properties.id,
      selectedEventId,
      hash,
    );
    switch (offlineResult.status) {
      case "accepted":
        setResult({
          status: "offline_valid",
          ticketType: offlineResult.scan.ticketType,
          eventTitle: selectedEvent?.title,
        });
        break;
      case "duplicate":
        setResult({
          status: "offline_duplicate",
          ticketType: offlineResult.scan.ticketType,
          eventTitle: selectedEvent?.title,
        });
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
    if (!selectedEvent || Date.parse(selectedEvent.endTime) <= Date.now() || !hash.trim()) return;
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
      void loadScanHistory(selectedEventId);
    } catch (scanError) {
      if (!isOnline || scanError instanceof TypeError) {
        await validateOfflineTicket(hash);
      } else {
        setResult({ status: "invalid" });
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
      await ApiClient.instance.post(
        "/dashboard/ticket-validation/events/{id}/staff",
        {
          params: { path: { id: selectedEvent.id } },
          body: { email: staffEmail.trim() },
        },
      );
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
      await ApiClient.instance.delete(
        "/dashboard/ticket-validation/events/{id}/staff/{userId}",
        {
          params: { path: { id: selectedEvent.id, userId: member.id } },
        },
      );
      setStaff((current) => current.filter((item) => item.id !== member.id));
      setNotice(t("validation.staffRemoved"));
    } catch {
      setError(t("validation.staffRemoveFailed"));
    }
  };

  const createScannerAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !selectedEvent ||
      !scannerLabel.trim() ||
      !scannerStartsAt ||
      !scannerEndsAt
    )
      return;
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
      setScannerAccesses((current) =>
        current.map((item) =>
          item.id === access.id
            ? { ...item, revokedAt: new Date().toISOString() }
            : item,
        ),
      );
      setNotice(t("validation.linkRevoked"));
    } catch {
      setError(t("validation.linkRevokeFailed"));
    }
  };

  const companyReady = profile?.verificationStatus === "approved";
  return {
    addStaff,
    admissionsClosed,
    agreementAccepted,
    companyName,
    companyReady,
    copyScannerAccess,
    createScannerAccess,
    creatingScannerAccess,
    cui,
    error,
    eventHeading,
    events,
    eventsLoading,
    i18n,
    isOnline,
    isOrganizer,
    latestScannerAccess,
    notice,
    offlineConflicts,
    offlinePendingCount,
    offlineSnapshot,
    prepareOffline,
    preparingOffline,
    profile,
    profileLoading,
    removeOfflineData,
    removeStaff,
    result,
    retryCompanyVerification,
    revokeScannerAccess,
    savingStaff,
    scanHistory,
    scanHistoryLoading,
    scanHistoryOpen,
    scannerAccessLoading,
    scannerAccesses,
    scannerEndsAt,
    scannerLabel,
    scannerStartsAt,
    selectedEvent,
    selectedEventId,
    setActiveTab,
    setAgreementAccepted,
    setCompanyName,
    setCui,
    setError,
    setReload,
    setScanHistoryOpen,
    setScannerEndsAt,
    setScannerLabel,
    setScannerStartsAt,
    setSelectedEventId,
    setStaffEmail,
    setValidationHash,
    staff,
    staffEmail,
    staffLoading,
    submitCompany,
    submitValidationHash,
    submittingProfile,
    syncOfflineScans,
    syncingOffline,
    t,
    validateTicket,
    validating,
    validationHash,
    validationTab,
  };
}
export type TicketValidationWorkspaceModel = ReturnType<typeof useTicketValidation>;
