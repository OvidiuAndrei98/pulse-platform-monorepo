"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, useWindowDimensions } from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { accountApi, useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import { ApiError } from "../data/http";

import type { OrganizerProfile } from "../dashboard/data";

import { AdmissionGate, admitTicket, type Admission, type ScanSource } from "./admission";
import { getScannerConnection, watchScannerConnection } from './connection';
import { isConnectivityError, mergeValidationEvents, uuid, type ValidationEvent } from "./data";
import { scannerApi, offlineScanner } from "./runtime";
import type { OfflineState } from "./offline";

import { prepareScanner, PreparationError, type PrepareScanner } from './preparation';

export function useScannerController({
  route,
  eventId,
  embedded = false,
}: {
  route?: { params?: { eventId?: string } };
  eventId?: string;
  embedded?: boolean;
}) {

  const { width } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { user, controller } = useAuth('account'),
    { copy, language } = usePreferences(),
    navigation = useNavigation<any>(),
    insets = useSafeAreaInsets(),
    focused = useIsFocused();
  const [foreground, setForeground] = useState(
      AppState.currentState === "active",
    ),
    [selected, setSelected] = useState(eventId ?? route?.params?.eventId ?? ""),
    [tab, setTab] = useState<"scan" | "team" | "links">("scan");
  const rememberEvent = (id?: string) => {
    const state = navigation.getState();
    // The standalone Scanner route also renders inside the dashboard shell.
    // Keep its event in the URL so browser Back restores the scanner selection.
    if (!embedded || state.routes[state.index]?.name === 'Scanner') navigation.setParams({ eventId: id });
  };
  const [offlineState, setOfflineState] = useState<OfflineState>(),
    [offlineError, setOfflineError] = useState(""),
    [busy, setBusy] = useState(false),
    [work, setWork] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<Admission>();
  const gate = useRef(new AdmissionGate()),
    revision = useRef(0),
    workLock = useRef(false);
  const ro = language === "ro",
    token = controller.getToken(),
    userId = user?.id;
  useEffect(() => {
    setSelected(eventId ?? route?.params?.eventId ?? "");
  }, [userId, eventId, route?.params?.eventId]);
  const organizer = user?.role === "organizer" || user?.role === "admin";
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => watchScannerConnection(setConnected), []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (value) =>
      setForeground(value === "active"),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    revision.current++;
    setResult(undefined);
    setError("");
    setNotice("");
    setOfflineState(undefined);
    setBusy(false);
    setWork(false);
    workLock.current = false;
    gate.current = new AdmissionGate();
    return () => {
      revision.current++;
    };
  }, [selected, userId, token]);
  const events = useQuery({
    queryKey: ["scanner-events", userId],
    enabled: !!userId && !!token && focused && foreground,
    refetchInterval: focused && foreground ? 15000 : false,
    retry: false,
    networkMode: 'always', // The query itself reads the durable local fallback.
    queryFn: async ({ signal }) => {
      const localEvents = async () => {
        const prepared = await offlineScanner.events(userId!);
        const cached = queryClient.getQueryData<{ events: ValidationEvent[] }>(['scanner-events', userId]);
        // Keep the selected camera alive even if its package was not prepared.
        // Cached event metadata never authorizes entry: store.scan requires a
        // valid, durable snapshot and otherwise returns "unprepared".
        return { events: mergeValidationEvents((cached?.events ?? []).map(event => ({ ...event, canManage: false })), prepared), offline: true };
      };
      if (await getScannerConnection() === false) {
        return localEvents();
      }
      try {
        const remote = await scannerApi.events(token!, signal);
        const prepared = await offlineScanner.events(userId!).catch(() => []);
        // Ended events disappear from the server's live list. Keep their durable
        // pending journals reachable so reconnection can still synchronize them.
        // The sync/validation endpoints remain authoritative for authorization.
        return {
          events: mergeValidationEvents(remote, prepared),
          offline: false,
        };
      } catch (error) {
        if (!isConnectivityError(error) || signal.aborted) throw error;
        return localEvents();
      }
    },
  });
  useEffect(() => {
    if (userId && token && focused && foreground && connected !== null) void events.refetch();
  }, [connected, focused, foreground, userId, token]);
  useEffect(() => {
    if (!events.data) return;
    if (!events.data.events.some((event) => event.id === selected))
      setSelected("");
  }, [events.data, selected]);
  const event = events.data?.events.find((event) => event.id === selected),
    offline = connected === false || events.data?.offline === true;
  const canManage = event?.canManage === true;
  const visibleTab = canManage ? tab : "scan";
  useEffect(() => {
    if (!canManage) setTab("scan");
  }, [canManage]);
  const refreshLocal = useCallback(async () => {
    if (!userId || !selected || !uuid.test(selected)) return;
    const version = revision.current;
    try {
      const state = await offlineScanner.state(userId, selected);
      if (version === revision.current) {
        setOfflineState(state);
        setOfflineError("");
      }
    } catch {
      if (version === revision.current)
        setOfflineError(
          ro
            ? "Datele locale nu pot fi citite în siguranță. Nu valida offline."
            : "Local data cannot be read safely. Do not validate offline.",
        );
    }
  }, [userId, selected, ro]);
  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);
  const history = useQuery({
    queryKey: ["scanner-history", userId, selected],
    enabled: !!token && !!event && !offline && !events.isError && focused && foreground,
    retry: false,
    queryFn: () => scannerApi.history(selected, token!),
  });
  const synchronize = useCallback(async () => {
    if (!userId || !token || !selected) return [];
    return offlineScanner.sync(userId, selected, (body) =>
      scannerApi.sync(selected, body, token),
    );
  }, [userId, selected, token]);
  const action = useCallback(
    async (task: () => Promise<void>) => {
      if (workLock.current || busy) return;
      workLock.current = true;
      setWork(true);
      setError("");
      setNotice("");
      const version = revision.current;
      try {
        await task();
      } catch (cause) {
        if (version === revision.current)
          setError(
            cause instanceof ApiError &&
              (cause.status === 401 || cause.status === 403)
              ? copy("scanner.sessionUnavailable")
              : copy("feedback.actionFailed"),
          );
      } finally {
        if (version === revision.current) {
          workLock.current = false;
          setWork(false);
          await refreshLocal();
        }
      }
    },
    [busy, copy, refreshLocal],
  );
  useEffect(() => {
    if (!event || offline || events.isError || !token) return;
    const version = revision.current;
    void synchronize()
      .then((results) => {
        if (version !== revision.current) return;
        if (results.length) {
          const count = results.filter(
            (row) => row.status !== "accepted",
          ).length;
          setNotice(
            copy(
              count
                ? "validation.offlineSyncConflicts"
                : "validation.offlineSyncComplete",
              { count },
            ),
          );
          void history.refetch();
        }
        return refreshLocal();
      })
      .catch((cause) => {
        if (version !== revision.current) return;
        setNotice(copy("validation.offlineSyncFailed"));
        if (
          cause instanceof ApiError &&
          (cause.status === 401 || cause.status === 403)
        )
          void offlineScanner
            .revoke(userId!, selected)
            .then(refreshLocal)
            .catch(() => {});
      });
  }, [events.dataUpdatedAt, event?.id, offline, token]);
  const submit = (hash: string, source: ScanSource = 'manual') => {
    if (
      !event ||
      !userId ||
      !token ||
      workLock.current ||
      events.isError ||
      offlineError ||
      offlineState?.revoked ||
      Date.parse(event.endTime) <= Date.now()
    )
      return;
    const version = revision.current;
    void gate.current
      .run(hash, async () => {
        setBusy(true);
        setResult(undefined);
        setError("");
        setNotice("");
        try {
          return await admitTicket({
            userId,
            eventId: selected,
            hash,
            offline,
            isOffline: async () => await getScannerConnection() === false,
            store: offlineScanner,
            sync: synchronize,
            validate: (value) => scannerApi.validate(selected, value, token),
          });
        } finally {
          if (version === revision.current) setBusy(false);
        }
      }, source)
      .then((result) => {
        if (
          version === revision.current &&
          result &&
          controller.getToken() === token
        ) {
          setResult(result);
          void refreshLocal();
          if (result.status === 'valid' || result.status === 'already_validated') void history.refetch();
        }
      })
      .catch((cause) => {
        if (version !== revision.current || controller.getToken() !== token)
          return;
        setError(
          cause instanceof ApiError &&
            (cause.status === 401 || cause.status === 403)
            ? copy("scanner.sessionUnavailable")
            : isConnectivityError(cause)
              ? ro
                ? "Rezultatul nu este confirmat. Nu permite accesul până nu verifici din nou online."
                : "Result unconfirmed. Verify again online before admitting."
              : (cause instanceof Error &&
                    cause.message === "INVALID_TICKET_CODE") ||
                  (cause instanceof ApiError &&
                    (cause.status === 400 || cause.status === 404))
                ? copy("validation.invalidTicket")
                : copy("feedback.actionFailed"),
        );
        void refreshLocal();
        if (isConnectivityError(cause)) void events.refetch();
      });
  };
  const prepare: PrepareScanner = async (camera, progress) => {
    if (!event || !userId || !token) throw new PreparationError('access');
    if (workLock.current || busy) throw new PreparationError('busy');
    const version = revision.current;
    const isCurrent = () => version === revision.current && controller.getToken() === token;
    workLock.current = true; setWork(true); setError(''); setResult(undefined); setNotice('');
    try {
      return await prepareScanner({
        eventId: selected, camera, progress, isCurrent,
        online: async () => await getScannerConnection() !== false,
        events: () => scannerApi.events(token),
        sync: synchronize,
        snapshot: () => scannerApi.snapshot(selected, token),
        save: (snapshot, event) => offlineScanner.save(userId, snapshot, event),
        read: () => offlineScanner.state(userId, selected),
        revoke: () => offlineScanner.revoke(userId, selected),
      });
    } finally {
      if (isCurrent()) { workLock.current = false; setWork(false); await refreshLocal(); }
    }
  };
  // Reuse the dashboard cache, but never let a failed profile refresh make a
  // prepared offline scanner inaccessible to staff or organizers.
  const profile = useQuery({
    queryKey: ["dashboard", userId, `/dashboard/organizer/profile/${userId}`],
    enabled: !!userId && !!token && organizer && !offline,
    retry: false,
    queryFn: async ({ signal }) => {
      try {
        return (
          (await accountApi<OrganizerProfile | null>(
            `/dashboard/organizer/profile/${userId}`,
            { signal },
          )) ?? null
        );
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404) return null;
        throw cause;
      }
    },
  });
const removeOfflinePackage = () => { void action(async () => { if(await offlineScanner.remove(userId!,selected))setNotice(copy("validation.offlineRemoved")); }); };
const syncOfflinePackage = () => { void action(async () => {const results=await synchronize(),count=results.filter(row=>row.status!=="accepted").length;setNotice(copy(count?"validation.offlineSyncConflicts":"validation.offlineSyncComplete",{count}));void history.refetch();});};
  return {
    removeOfflinePackage,
    syncOfflinePackage,
    agreementOpen,
    busy,
    canManage,
    copy,
    embedded,
    error,
    event,
    events,
    focused,
    foreground,
    history,
    insets,
    language,
    navigation,
    notice,
    offline,
    offlineError,
    offlineState,
    organizer,
    prepare,
    profile,
    rememberEvent,
    result,
    ro,
    selected,
    setAgreementOpen,
    setNotice,
    setSelected,
    setTab,
    submit,
    tab,
    authenticated: !!user && !!token,
    scannerKey: selected + ':' + userId,
    visibleTab,
    width,
    work,
  };
}
export type ScannerScreenModel = ReturnType<typeof useScannerController>;
