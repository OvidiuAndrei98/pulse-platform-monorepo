import type { ViewInstance } from 'react-native';
import { ActionIcon } from '../ui/ActionIcon';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDown, History, RefreshCw, ScanLine, Settings2, Ticket, Wifi, WifiOff } from "lucide-react-native";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { ApiError } from "../data/http";
import { Button, Feedback, IconButton, Loading } from "../ui/common";
import { Text } from "../ui/Text";
import { Action, dColors as colors } from "../dashboard/common";
import { Company } from "../dashboard/DashboardCompany";
import { OrganizerAgreement } from "../dashboard/OrganizerDocuments";
import type { OrganizerProfile } from "../dashboard/data";
import { formatDate } from "../data/events";
import {
  dropdownPlacement,
  type DropdownAnchor,
} from "../dashboard/dropdownPlacement";
import { AdmissionGate, admitTicket, type Admission, type ScanSource } from "./admission";
import { getScannerConnection, watchScannerConnection } from './connection';
import { isConnectivityError, mergeValidationEvents, uuid, type ValidationEvent } from "./data";
import { scannerApi, offlineScanner } from "./runtime";
import type { OfflineState } from "./offline";
import { ScannerPanel, s } from "./ScannerPanel";
import { ScannerManagement } from "./ScannerManagement";
import { prepareScanner, PreparationError, type PrepareScanner } from './preparation';
import { OfflinePackageStatus } from './OfflinePackageStatus';

export function ScannerScreen({
  route,
  eventId,
  embedded = false,
}: {
  route?: { params?: { eventId?: string } };
  eventId?: string;
  embedded?: boolean;
}) {
  const { width, height } = useWindowDimensions();
  const queryClient = useQueryClient();
  const selector = useRef<ViewInstance>(null);
  const [anchor, setAnchor] = useState<DropdownAnchor>({
    x: 20,
    y: 100,
    width: 1,
    height: 44,
  });
  const { user, controller } = useAuth(),
    { copy, language } = usePreferences(),
    navigation = useNavigation<any>(),
    insets = useSafeAreaInsets(),
    focused = useIsFocused();
  const [foreground, setForeground] = useState(
      AppState.currentState === "active",
    ),
    [selected, setSelected] = useState(eventId ?? route?.params?.eventId ?? ""),
    [menu, setMenu] = useState(false),
    [tab, setTab] = useState<"scan" | "management">("scan");
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
  useEffect(() => {
    setMenu(false);
  }, [width, height, busy, work]);
  useEffect(() => {
    if (!menu || Platform.OS !== "web") return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menu]);
  const ro = language === "ro",
    token = controller.getToken(),
    userId = user?.id;
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
        return { events: mergeValidationEvents(cached?.events ?? [], prepared), offline: true };
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
      setSelected(events.data.events[0]?.id ?? "");
  }, [events.data, selected]);
  const event = events.data?.events.find((event) => event.id === selected),
    offline = connected === false || events.data?.offline === true;
  const canManage = event?.canManage === true;
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
  if (!user || !token)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: insets.top + 32,
        }}
      >
        <Feedback title={copy("scanner.sessionUnavailable")} />
        <Button
          title={ro ? "Conectează-te" : "Sign in"}
          onPress={() => navigation.navigate("Auth", { returnScanner: true })}
        />
      </View>
    );
  const pending =
      offlineState?.scans.filter((scan) => scan.status === "pending").length ??
      0,
    conflicts =
      offlineState?.scans.filter((scan) => scan.status === "conflict") ?? [];
  const needsCompany =
    organizer &&
    !offline &&
    profile.isSuccess &&
    profile.data?.verificationStatus !== "approved";
  const company = (
    <Company
      profile={profile.data ?? undefined}
      loading={profile.isLoading}
      error={profile.isError && !offline}
      onRetry={() => {
        void profile.refetch();
      }}
      onAgreement={() => setAgreementOpen(true)}
    />
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={events.isFetching && !events.isPending}
            onRefresh={() => {
              void events.refetch();
            }}
            tintColor={colors.accent}
          />
        }
        contentContainerStyle={{
          paddingTop: embedded ? 32 : insets.top + 20,
          paddingHorizontal: width >= 640 ? 32 : 20,
          paddingBottom: insets.bottom + (embedded ? 110 : 36),
          maxWidth: needsCompany ? 672 : 1024,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {!embedded && (
          <View style={{ marginBottom: 20 }}>
            <IconButton
              label={copy("common.back")}
              onPress={() =>
                navigation.canGoBack()
                  ? navigation.goBack()
                  : navigation.navigate("Tabs", { screen: "Profile" })
              }
            >
              <ActionIcon name="back" color="white" size={22} />
            </IconButton>
          </View>
        )}
        {agreementOpen ? (
          <View style={{ gap: 20 }}>
            <IconButton
              label={copy("common.back")}
              onPress={() => setAgreementOpen(false)}
            >
              <ActionIcon name="back" color="white" size={22} />
            </IconButton>
            <OrganizerAgreement
              profile={profile.data ?? undefined}
              onCompany={() => setAgreementOpen(false)}
              onHome={() => setAgreementOpen(false)}
            />
          </View>
        ) : needsCompany ? (
          company
        ) : (
          <View testID="scanner-page" style={{ gap: 24 }}>
            <View
              style={[
                s.row,
                {
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: width >= 640 ? 30 : 24,
                    lineHeight: width >= 640 ? 36 : 32,
                    fontWeight: "700",
                  }}
                >
                  {copy("validation.title")}
                </Text>
                <Text style={s.muted}>{copy("validation.subtitle")}</Text>
              </View>
              <View
                style={[
                  s.row,
                  {
                    flexShrink: 0,
                    marginTop: 4,
                    gap: 6,
                    borderRadius: 99,
                    borderWidth: 1,
                    borderColor: offline ? "#fcd34d59" : "#ff004459",
                    backgroundColor: offline ? "#fcd34d1a" : "#ff00441a",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  },
                ]}
              >
                {offline ? (
                  <WifiOff size={14} color="#fde68a" />
                ) : (
                  <Wifi size={14} color={colors.accent} />
                )}
                <Text
                  testID="scanner-connection"
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: offline ? "#fde68a" : colors.accent,
                  }}
                >
                  {offline ? copy('validation.offline') : events.isPending || events.isError ? (ro ? 'Se verifică conexiunea' : 'Checking connection') : copy('validation.online')}
                </Text>
              </View>
            </View>
            {events.isError ? (
              <Feedback
                title={copy("validation.eventsLoadFailed")}
                retry={() => {
                  void events.refetch();
                }}
              />
            ) : null}
            <View
              style={[
                s.panel,
                {
                  backgroundColor: "#ff00440a",
                  borderColor: "#ff004440",
                  zIndex: 5,
                },
              ]}
            >
              <Text style={s.eyebrow}>{copy("validation.configureEvent")}</Text>
              <View style={{ marginTop: 12, zIndex: 5 }}>
                <Pressable
                  ref={selector}
                  testID="scanner-event-selector"
                  accessibilityRole="button"
                  accessibilityLabel={copy("validation.chooseEvent")}
                  accessibilityState={{
                    expanded: menu,
                    disabled: events.isPending || busy || work,
                  }}
                  disabled={events.isPending || busy || work}
                  onPress={() =>
                    selector.current?.measureInWindow((x, y, width, height) => {
                      if (width > 0) {
                        setAnchor({ x, y, width, height });
                        setMenu(true);
                      }
                    })
                  }
                  style={[
                    s.row,
                    {
                      height: 44,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#ffffff26",
                      paddingHorizontal: 12,
                      backgroundColor: "#00000099",
                      gap: 8,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      color: event ? colors.text : colors.muted,
                      fontSize: 14,
                    }}
                  >
                    {event?.title ||
                      copy(
                        events.isPending
                          ? "validation.loadingEvents"
                          : "validation.chooseEvent",
                      )}
                  </Text>
                  <ChevronDown
                    size={16}
                    color={colors.text}
                    style={{
                      transform: [{ rotate: menu ? "180deg" : "0deg" }],
                    }}
                  />
                </Pressable>
                {menu && (
                  <Modal
                    transparent
                    animationType="none"
                    statusBarTranslucent
                    onRequestClose={() => setMenu(false)}
                  >
                    <View style={{ flex: 1 }}>
                      <Pressable
                        accessibilityLabel={copy("common.close")}
                        onPress={() => setMenu(false)}
                        style={{ position: "absolute", inset: 0 }}
                      />
                      <ScrollView
                        testID="scanner-event-menu"
                        nestedScrollEnabled
                        style={{
                          position: "absolute",
                          ...dropdownPlacement(
                            anchor,
                            { width, height },
                            Math.min(
                              224,
                              Math.max(
                                52,
                                (events.data?.events.length ?? 0) * 40 + 8,
                              ),
                            ),
                          ),
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: "#ffffff26",
                          backgroundColor: "#000",
                          zIndex: 10,
                          boxShadow: "0px 20px 25px rgba(0,0,0,0.3)",
                        }}
                        contentContainerStyle={{ padding: 4 }}
                      >
                        {events.data?.events.map((item) => (
                          <Pressable
                            accessibilityRole="button"
                            key={item.id}
                            disabled={busy || work}
                            onPress={() => {
                              setSelected(item.id);
                              setMenu(false);
                              setTab("scan");
                            }}
                            style={[
                              s.row,
                              {
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                gap: 8,
                                borderRadius: 6,
                                backgroundColor:
                                  item.id === selected
                                    ? "#ff00441a"
                                    : "transparent",
                              },
                            ]}
                          >
                            <Ticket
                              size={16}
                              color={
                                item.id === selected
                                  ? colors.accent
                                  : colors.text
                              }
                            />
                            <Text
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                fontSize: 14,
                                color:
                                  item.id === selected
                                    ? colors.accent
                                    : colors.text,
                              }}
                            >
                              {item.title}
                            </Text>
                            {item.canManage && (
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: "600",
                                  textTransform: "uppercase",
                                  color: colors.muted,
                                }}
                              >
                                {copy("validation.organizer")}
                              </Text>
                            )}
                          </Pressable>
                        ))}
                        {!events.data?.events.length && (
                          <Text style={[s.muted, { padding: 12 }]}>
                            {copy("validation.noAssignedEvents")}
                          </Text>
                        )}
                      </ScrollView>
                    </View>
                  </Modal>
                )}
              </View>
              <Text style={[s.tiny, { marginTop: 12 }]}>
                {copy("validation.scopeHint")}
              </Text>
            </View>
            {!events.isPending && !event && !events.isError ? (
              <Feedback title={copy(offline ? "validation.offlineUnprepared" : "validation.noAssignedEvents")} />
            ) : null}
            {canManage && <View
              testID="scanner-tabs"
              style={[
                s.row,
                {
                  padding: 6,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#ffffff1a",
                  backgroundColor: "#ffffff08",
                },
              ]}
            >
              {(["scan", "management"] as const).map((value) => {
                const Icon = value === "scan" ? ScanLine : Settings2;
                return (
                  <Pressable
                    testID={"scanner-tab-" + value}
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === value }}
                    onPress={() => {
                      setMenu(false);
                      setTab(value);
                    }}
                    style={[
                      s.row,
                      {
                        flex: 1,
                        height: 44,
                        justifyContent: "center",
                        gap: 8,
                        borderRadius: 8,
                        backgroundColor:
                          tab === value ? colors.accent : "transparent",
                      },
                    ]}
                  >
                    <Icon
                      size={16}
                      color={tab === value ? colors.text : colors.muted}
                    />
                    <Text
                      style={{
                        color: tab === value ? colors.text : colors.muted,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {copy("validation." + value + "Tab")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>}
            {canManage && tab === "management" ? (
              <>
                {organizer && company}
                {event?.canManage && (
                  <ScannerManagement
                    key={event.id + ":" + token}
                    event={event}
                    token={token}
                  />
                )}
              </>
            ) : (
              <ScannerPanel
                key={selected + ':' + userId}
                eventTitle={event?.title}
                gateStatus={{ connection: offline ? 'offline' : events.isError || events.isPending ? 'checking' : 'online', pending, state: offlineState }}
                onPrepare={prepare}
                canPrepare={!!event && focused && foreground}
                active={
                  !!event &&
                  focused &&
                  foreground &&
                  !events.isError &&
                  !offlineError &&
                  !offlineState?.revoked &&
                  Date.parse(event.endTime) > Date.now()
                }
                busy={busy || work}
                result={result}
                error={error}
                onScan={submit}
              >
                <View
                  testID="scanner-offline-controls"
                  style={[
                    s.row,
                    {
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      gap: 12,
                      borderTopWidth: 1,
                      borderColor: "#ffffff1a",
                      paddingTop: 16,
                      marginTop: 16,
                    },
                  ]}
                >
                  <View style={{ flexShrink: 1, gap: 4 }}>
                    <OfflinePackageStatus state={offlineState} />
                    {pending > 0 && (
                      <Text
                        style={[
                          s.tiny,
                          { fontWeight: "600", color: "#fde68a" },
                        ]}
                      >
                        {copy("validation.offlinePending", { count: pending })}
                      </Text>
                    )}
                    {offlineError ? (
                      <Text style={s.error}>{offlineError}</Text>
                    ) : null}
                    {offlineState?.revoked ? (
                      <Text style={s.error}>
                        {copy("scanner.sessionUnavailable")}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[s.row, { gap: 8, flexWrap: "wrap" }]}>
                    {offlineState?.snapshot && (
                      <Action
                        secondary
                        title={copy("validation.offlineRemove")}
                        style={{
                          height: 36,
                          minHeight: 36,
                          paddingHorizontal: 12,
                          backgroundColor: "transparent",
                          borderWidth: 1,
                          borderColor: "#ffffff1a",
                        }}
                        textStyle={{ color: colors.muted, fontSize: 12 }}
                        disabled={pending > 0 || work || busy}
                        onPress={() => {
                          void action(async () => {
                            if (await offlineScanner.remove(userId!, selected))
                              setNotice(copy("validation.offlineRemoved"));
                          });
                        }}
                      />
                    )}
                    {pending > 0 && <Action
                      icon={RefreshCw}
                      title={copy('validation.syncNow')}
                      style={[
                        s.accentButton,
                        { height: 36, minHeight: 36, paddingHorizontal: 12 },
                      ]}
                      textStyle={{ color: colors.accent, fontSize: 12 }}
                      disabled={
                        !event || offline || busy || work || events.isError
                      }
                      onPress={() => {
                        void action(async () => {
                          const results = await synchronize(),
                            count = results.filter(
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
                        });
                      }}
                    />}
                  </View>
                </View>
                {conflicts.length > 0 && (
                  <View
                    style={{
                      marginTop: 12,
                      gap: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#fbbf2440",
                      backgroundColor: "#fbbf240f",
                    }}
                  >
                    <Text
                      style={[s.muted, { fontWeight: "600", color: "#fef3c7" }]}
                    >
                      {copy("validation.offlineConflictsTitle", {
                        count: conflicts.length,
                      })}
                    </Text>
                    <Text style={[s.tiny, { color: "#fde68a" }]}>
                      {copy("validation.offlineConflictHint")}
                    </Text>
                    {conflicts.map((scan) => (
                      <View key={scan.clientScanId} style={{ gap: 4 }}>
                        <Text style={s.tiny}>
                          {scan.ticketType} ·{" "}
                          {copy(
                            "validation.offlineConflict." + scan.serverStatus,
                          )}
                        </Text>
                        <Text selectable style={s.tiny}>
                          {scan.ticketId} ·{" "}
                          {formatDate(scan.scannedAt, language, true)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                <View
                  style={{
                    marginTop: 20,
                    borderWidth: 1,
                    borderColor: "#ffffff1a",
                    borderRadius: 12,
                    backgroundColor: "#00000026",
                    padding: width >= 640 ? 20 : 16,
                  }}
                >
                  <View
                    style={[
                      s.row,
                      {
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 16,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.eyebrow}>
                        {copy("validation.yourScans")}
                      </Text>
                      <Text
                        style={{
                          marginTop: 4,
                          color: colors.text,
                          fontSize: 30,
                          lineHeight: 36,
                          fontWeight: "700",
                        }}
                      >
                        {history.isFetching || history.isError
                          ? "–"
                          : (history.data?.totalScans ?? 0)}
                      </Text>
                      <Text style={[s.muted, { marginTop: 4 }]}>
                        {copy("validation.scansForEvent")}
                      </Text>
                    </View>
                    <Pressable
                      testID="scanner-open-history"
                      accessibilityRole="button"
                      accessibilityLabel={copy("validation.openScanHistory")}
                      onPress={() => navigation.navigate('ScannerHistory', { eventId: selected, eventTitle: event?.title })}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        backgroundColor: "#ff00441a",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <History size={20} color={colors.accent} />
                    </Pressable>
                  </View>
                  <Text style={[s.tiny, { marginTop: 16 }]}>
                    {copy("validation.scanHistoryHint")}
                  </Text>
                </View>
              </ScannerPanel>
            )}
            {!!notice && (
              <Text
                accessibilityLiveRegion="polite"
                style={[s.muted, { color: colors.accent }]}
              >
                {notice}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
