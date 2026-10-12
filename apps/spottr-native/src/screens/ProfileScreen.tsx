import { uploadProfileAvatar } from "../profile/avatar";
import { AppSheetScrollView } from "../ui/AppSheetScrollView";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { MotionPressable as Pressable } from "../ui/MotionPressable";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { AppSheetTextInput } from "../ui/AppSheetTextInput";
import {
  Bookmark,
  Camera,
  ChevronRight,
  Globe2,
  Lock,
  LogOut,
  Mail,
  QrCode,
  Receipt,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react-native";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { ApiError } from "../data/http";
import { usePreferences } from "../PreferencesProvider";
import {
  useHiddenCategories,
  PreferencesSheet,
} from "../profile/PreferencesSheet";
import { QuickConnectSheet } from "../profile/QuickConnectSheet";
import {
  TicketSheet,
  ticketStatus,
  type UserTicket,
} from "../profile/TicketSheet";
import { AppSheet } from "../ui/AppSheet";
import { Text } from "../ui/Text";
import { EventImage, Feedback, Loading, useOpenLink } from "../ui/common";
import { colors } from "../ui/theme";
import { seedEvent } from "../data/queries";
import { formatDate } from "../data/events";
import { WEB_URL } from "../config";
import type { RootParamList } from "../navigation/types";
import { AuthButton, AuthMessage } from "./AuthScreen";
import { useTickets } from "../data/useTickets";
import { TicketAvailability } from "../profile/TicketAvailability";
import { TicketCarousel } from "../profile/TicketCarousel";
import { profileTicketGroups } from "../profile/ticketGroups";
import { useEventClock } from "../data/useEventClock";
export function ProfileScreen() {
  const auth = useAuth(),
    { copy, saved, savedLoading, savedError, retrySaved, language, setLanguage, actionError } = usePreferences(),
    focused = useIsFocused();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>(),
    safe = useSafeAreaInsets(),
    link = useOpenLink();
  const [row, setRow] = useState(""),
    [sheet, setSheet] = useState<"preferences" | "connect" | "delete" | null>(
      null,
    );
  const [ticket, setTicket] = useState<UserTicket | null>(null),
    [tab, setTab] = useState<"active" | "history">("active");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [success, setSuccess] = useState("");
  const [username, setUsername] = useState(""),
    [bio, setBio] = useState("");
  const tickets = useTickets(focused),
    hidden = useHiddenCategories(),
    pending = useRef(false);
  const now = useEventClock();
  const validationEvents = useQuery({ queryKey: ['validation-access', auth.user?.id], enabled: !!auth.user, queryFn: async ({ signal }) => { const result = await accountApi<unknown>('/dashboard/ticket-validation/events', { signal }); if (result === null) return []; if (!Array.isArray(result)) throw new Error('Invalid validation events'); return result; } });
  const activeSafety = tickets.data?.find(ticket => ticket.isValidated && Date.parse(ticket.endTime) + 86400000 >= Date.now());
  useEffect(() => {
    if (focused && auth.ready && !auth.user)
      navigation.navigate("Auth", { returnTab: "Profile" });
  }, [focused, auth.ready, auth.user, navigation]);
  useEffect(() => {
    setUsername(auth.user?.username ?? "");
    setBio(auth.user?.bio ?? "");
  }, [auth.user?.id, auth.user?.username, auth.user?.bio]);
  useEffect(() => {
    setRow("");
    setSheet(null);
    setTicket(null);
    setMessage("");
    setSuccess("");
    setTab("active");
  }, [auth.user?.id]);
  if (!auth.ready || !auth.user) return <Loading />;
  const user = auth.user,
    activeTickets = (tickets.data ?? []).filter(
      (item) => ticketStatus(item, now) === "active",
    );
  const groups = profileTicketGroups(tickets.data ?? [], tab, now);
  const run = async (operation: () => Promise<unknown>, successFor = "") => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    setSuccess("");
    const token = auth.controller.getToken();
    try {
      await operation();
      if (auth.controller.getToken() === token) setSuccess(successFor);
    } catch (cause) {
      if (auth.controller.getToken() === token)
        setMessage(
          copy(
            cause instanceof Error && cause.message.startsWith("profile.")
              ? cause.message
              : "feedback.actionFailed",
          ),
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const avatar = () => run(() => uploadProfileAvatar(auth.controller));
  const toggle = (key: string) => {
    if (pending.current) return;
    setSuccess("");
    setMessage("");
    setRow((old) => (old === key ? "" : key));
  };
  return (
    <>
      <ScrollView
        testID="profile-list"
        style={{ flex: 1, backgroundColor: "#000" }}
        contentContainerStyle={{
          paddingTop: Math.max(24, safe.top),
          paddingHorizontal: 20,
          paddingBottom: 110,
          gap: 28,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View>
            <View style={s.avatar}>
              {user.avatarUrl ? (
                <EventImage
                  uri={user.avatarUrl}
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <UserRound color={colors.muted} size={40} />
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy("profile.changeAvatar")}
              disabled={busy}
              onPress={() => void avatar()}
              style={s.camera}
            >
              <Camera size={17} color="white" />
            </Pressable>
          </View>
          <View style={{ flex: 1, gap: 7 }}>
            <Text style={{ color: "white", fontWeight: "600", fontSize: 24 }}>
              {user.username}
            </Text>
            <View
              style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
            >
              <Mail size={14} color={colors.muted} />
              <Text
                style={{ color: colors.muted, fontSize: 14, flexShrink: 1 }}
              >
                {user.email}
              </Text>
            </View>
            <View style={s.member}>
              <Sparkles size={12} color={colors.accent} />
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {copy("userProfile.memberSince", {
                  year: new Date(user.createdAt).getFullYear(),
                })}
              </Text>
            </View>
          </View>
        </View>
        {(message || auth.storageError || actionError) && (
          <AuthMessage text={message || copy("feedback.actionFailed")} />
        )}
        {user.role !== "user" && (
          <Row
            icon={UserRound}
            title={copy("profile.yourAccount")}
            onPress={() => user.role === 'admin' ? navigation.navigate('Admin') : navigation.navigate('Dashboard', { section: 'profile' })}
          />
        )}
        {user.role !== 'organizer' && activeSafety && <Pressable accessibilityRole="button" testID="profile-safety-group" onPress={() => navigation.navigate('SafetyGroup', { eventId: activeSafety.eventId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 26, borderWidth: 1, borderColor: '#34d3994d', backgroundColor: '#34d39917' }}><ShieldCheck size={26} color="#34d399"/><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{copy('safetyGroup.activeEvent', { event: activeSafety.eventTitle })}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{copy('safetyGroup.openGroup')}</Text></View><ChevronRight size={16} color="#6ee7b7"/></Pressable>}
        {user.role !== 'organizer' && !!validationEvents.data?.length && <Row icon={QrCode} title={copy('userProfile.ticketValidation')} hint={copy('userProfile.validationAccess', { count: validationEvents.data.length })} onPress={() => navigation.navigate('Scanner')}/>}
        <View style={s.connect}>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={s.qrIcon}>
              <QrCode size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>
                {copy("qr.quickConnect")}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                {copy("qr.showOrScan")}
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSheet("connect")}
            style={s.myCode}
          >
            <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
              {copy("qr.myCode")}
            </Text>
          </Pressable>
        </View>
        <View style={{ gap: 12 }}>
          <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><Text style={s.section}>{copy("userProfile.savedEvents")}</Text>{saved.length > 4 && <Pressable accessibilityRole="button" testID="profile-saved-all" onPress={() => navigation.navigate("Tabs", {screen:"Profile",params:{screen:"SavedEvents"}})} style={{minHeight:44,justifyContent:"center"}}><Text style={{fontSize:12,color:colors.accent}}>{copy("common.seeAll")}</Text></Pressable>}</View>
          {savedLoading ? <Loading /> : savedError ? <Feedback title={copy("feedback.loadFailed")} retry={retrySaved} /> : saved.length ? (
            saved.slice(0, 4).map((event) => (
              <Pressable
                key={event.id}
                accessibilityRole="button"
                onPress={() => {
                  seedEvent(event);
                  navigation.navigate("Event", { id: event.id });
                }}
                style={s.saved}
              >
                <EventImage
                  uri={event.bannerUrl}
                  style={{ height: 48, width: 48, borderRadius: 12 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: "white", fontWeight: "600", fontSize: 14 }}
                  >
                    {event.title}
                  </Text>
                  <Text style={s.hint}>
                    {event.locationName} ·{" "}
                    {formatDate(event.startTime, language)}
                  </Text>
                </View>
                <Bookmark
                  size={16}
                  color={colors.accent}
                  fill={colors.accent}
                />
              </Pressable>
            ))
          ) : (
            <Text style={s.empty}>{copy("userProfile.noSavedEvents")}</Text>
          )}
        </View>
        <View style={{ gap: 12 }}>
          <Text style={s.section}>{copy("userProfile.ticketsOrders")}</Text>
          <View style={s.tabs}>
            {(["active", "history"] as const).map((value) => (
              <Pressable
                key={value}
                testID={'profile-tickets-tab-' + value}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === value }}
                onPress={() => setTab(value)}
                style={[
                  s.tab,
                  tab === value && { backgroundColor: colors.accent },
                ]}
              >
                <Text
                  style={{
                    color: tab === value ? "white" : colors.muted,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {copy("userProfile." + value)}
                  {value === "active" ? ` (${activeTickets.length})` : ""}
                </Text>
              </Pressable>
            ))}
          </View>
          <TicketAvailability offline={tickets.offline} savedAt={tickets.savedAt} storageError={tickets.storageError} refreshing={tickets.isFetching} onRefresh={() => void tickets.refetch()} />
          {tickets.isPending ? (
            <Loading />
          ) : tickets.isError && !tickets.data ? (
            <Feedback
              title={copy("feedback.loadFailed")}
              retry={() => void tickets.refetch()}
            />
          ) : groups.length ? (
            <TicketCarousel
              key={user.id + ':' + tab}
              groups={groups}
              tab={tab}
              now={now}
              onOpen={setTicket}
            />
          ) : (
            <View>
              <Text style={s.empty}>
                {copy(
                  tab === "active"
                    ? "userProfile.noActiveTickets"
                    : "tickets.noHistory",
                )}
              </Text>
            </View>
          )}
          <Pressable testID="profile-tickets-all" accessibilityRole="button" onPress={() => navigation.navigate("Tabs", {screen:"Profile",params:{screen:"Tickets"}})} style={{minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:99,borderWidth:1,borderColor:"#ffffff1a"}}><Text style={{color:"white",fontSize:14,fontWeight:"600"}}>{copy("userProfile.viewAllTickets")}</Text></Pressable>
          {tab === "history" && (
            <Row
              icon={Receipt}
              title={copy("userProfile.viewInvoices")}
              hint={copy("userProfile.ordersPayments")}
              onPress={() => navigation.navigate("Tabs", {screen:"Profile",params:{screen:"Orders"}})}
            />
          )}
        </View>
        <View style={{ gap: 12 }}>
          <Text style={s.section}>{copy("userProfile.accountSecurity")}</Text>
          <View style={s.panel}>
            <Row
              icon={UserRound}
              title={copy("userProfile.personalDetails")}
              hint={copy("userProfile.personalDetailsHint")}
              onPress={() => toggle("details")}
            />
            {row === "details" && (
              <View style={s.form}>
                <Text style={s.hint}>{copy("profile.displayName")}</Text>
                <TextInput
                  accessibilityLabel={copy("profile.displayName")}
                  value={username}
                  onChangeText={setUsername}
                  maxLength={50}
                  style={s.input}
                />
                <Text style={s.hint}>{copy("profile.bio")}</Text>
                <TextInput
                  accessibilityLabel={copy("profile.bio")}
                  value={bio}
                  onChangeText={setBio}
                  maxLength={500}
                  multiline
                  style={[s.input, { minHeight: 84 }]}
                />
                <AuthButton
                  title={copy(
                    success === "details" ? "profile.saved" : "profile.saveChanges",
                  )}
                  busy={busy}
                  onPress={() =>
                    void run(async () => {
                      if (username.trim().length < 3)
                        throw new Error("profile.displayNameTooShort");
                      await auth.controller.update({
                        username: username.trim(),
                        bio: bio.trim(),
                      });
                    }, "details")
                  }
                />
              </View>
            )}
            <Row
              icon={Lock}
              title={copy("userProfile.changePassword")}
              onPress={() => toggle("password")}
            />
            {row === "password" && (
              <View style={s.form}>
                <Text style={s.hint}>
                  {copy("profile.resetHint", { email: user.email })}
                </Text>
                <AuthButton
                  title={copy(
                    success === "password" ? "profile.linkSent" : "profile.resetPassword",
                  )}
                  busy={busy}
                  onPress={() =>
                    void run(() =>
                      accountApi("/auth/forgot-password", {
                        method: "POST",
                        body: { email: user.email },
                        token: null,
                      }), "password")
                  }
                />
              </View>
            )}
            <Row
              icon={Globe2}
              title={copy("profile.language")}
              hint={copy(
                language === "ro" ? "profile.romanian" : "profile.english",
              )}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const next = language === "ro" ? "en" : "ro";
                  const updated = await auth.controller.update({
                    preferredLanguage: next,
                  });
                  if (updated) setLanguage(next);
                })
              }
            />
            {user.role === "user" && (
              <Row
                icon={SlidersHorizontal}
                title={copy("hiddenCategories.preferencesTitle")}
                hint={
                  hidden.data?.length
                    ? copy("hiddenCategories.count", {
                        count: hidden.data.length,
                      })
                    : copy("hiddenCategories.preferencesHint")
                }
                onPress={() => setSheet("preferences")}
              />
            )}
            <Row
              icon={UsersRound}
              title={copy("profile.attendancePrivacy")}
              hint={copy(
                user.showAttendancePublicly
                  ? "profile.attendanceVisible"
                  : "profile.attendanceHidden",
              )}
              trailing={
                <Switch
                  accessibilityLabel={copy("profile.attendancePrivacy")}
                  value={user.showAttendancePublicly}
                  disabled={busy}
                  trackColor={{ true: colors.accent, false: "#333" }}
                  onValueChange={(value) =>
                    void run(() =>
                      auth.controller.update({ showAttendancePublicly: value }),
                    )
                  }
                />
              }
            />
            <Row
              icon={Trash2}
              title={copy("userProfile.deleteAccount")}
              danger
              onPress={() => setSheet("delete")}
            />
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Text style={s.section}>{copy("userProfile.supportLegal")}</Text>
          <View style={s.panel}>
            <Row
              icon={ChevronRight}
              title={copy("userProfile.helpSupport")}
              hint={copy("userProfile.helpHint")}
              onPress={() => toggle("help")}
            />
            {row === "help" && (
              <Text style={[s.hint, { padding: 16 }]}>
                {copy("userProfile.helpText")}
              </Text>
            )}
            <Row
              icon={ChevronRight}
              title={copy("userProfile.terms")}
              onPress={() => navigation.navigate('Legal', { document: 'terms' })}
            />
            <Row
              icon={ChevronRight}
              title={copy("userProfile.privacy")}
              onPress={() => navigation.navigate('Legal', { document: 'privacy' })}
            />
          </View>
        </View>
        {link.error && <AuthMessage text={copy("feedback.actionFailed")} />}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void auth.controller.logout();
            navigation.navigate("Tabs", { screen: "Home" });
          }}
          style={s.logout}
        >
          <LogOut color="#f87171" size={16} />
          <Text style={{ color: "#f87171", fontSize: 14, fontWeight: "600" }}>
            {copy("userProfile.logout")}
          </Text>
        </Pressable>
        <Text style={{ color: "#ffffff66", textAlign: "center", fontSize: 10 }}>
          SPOTTR
        </Text>
      </ScrollView>
      {sheet === "preferences" && (
        <PreferencesSheet key={user.id} onClose={() => setSheet(null)} />
      )}
      {sheet === "connect" && (
        <QuickConnectSheet key={user.id} onClose={() => setSheet(null)} />
      )}
      {sheet === "delete" && <DeleteSheet onClose={() => setSheet(null)} />}
      {ticket && (
        <TicketSheet
          initialId={ticket.id}
          offline={tickets.offline}
          savedAt={tickets.savedAt}
          tickets={(tickets.data ?? []).filter(item =>
            item.eventId === ticket.eventId &&
            (item.id === ticket.id || (ticketStatus(item, now) === 'active') === (tab === 'active')),
          )}
          onClose={() => setTicket(null)}
        />
      )}
    </>
  );
}
function Row({
  icon: Icon,
  title,
  hint,
  onPress,
  trailing,
  disabled,
  danger,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  const content = (
    <>
      <View style={s.rowIcon}>
        <Icon size={16} color={danger ? "#f87171" : colors.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: danger ? "#f87171" : "white",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {hint && <Text style={s.hint}>{hint}</Text>}
      </View>
      {trailing ?? <ChevronRight size={16} color={colors.muted} />}
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={s.row}
    >
      {content}
    </Pressable>
  ) : (
    <View style={s.row}>{content}</View>
  );
}
function DeleteSheet({ onClose }: { onClose: () => void }) {
  const { user, controller } = useAuth(),
    { copy } = usePreferences();
  const [confirmation, setConfirmation] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  if (!user) return null;
  const valid =
    confirmation.trim().toLowerCase() === user.email.toLowerCase() &&
    (!user.hasPassword || password.length > 0);
  const remove = async () => {
    if (!valid || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const token = controller.getToken();
    try {
      await accountApi("/users/me", {
        method: "DELETE",
        token,
        body: {
          confirmation: confirmation.trim(),
          ...(user.hasPassword ? { currentPassword: password } : {}),
        },
      });
      if (controller.getToken() === token) await controller.logout();
    } catch (cause) {
      setError(
        copy(
          cause instanceof ApiError && cause.status === 401
            ? user.hasPassword
              ? "userProfile.deletePasswordInvalid"
              : "userProfile.deleteGoogleReauthRequired"
            : "userProfile.deleteFailed",
        ),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <AppSheet open onClose={onClose} label={copy("common.close")} height={0.85}>
      <AppSheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 28 }}
      >
        <Text style={s.section}>{copy("userProfile.deleteDialogTitle")}</Text>
        <Text style={s.hint}>
          {copy("userProfile.deleteDialogDescription")}
        </Text>
        {["deleteProfileData", "deleteTicketsData", "retainFiscalData"].map(
          (key) => (
            <Text key={key} style={s.hint}>
              • {copy("userProfile." + key)}
            </Text>
          ),
        )}
        <Text style={s.hint}>
          {copy("userProfile.deleteConfirmationHint", { email: user.email })}
        </Text>
        <AppSheetTextInput
          accessibilityLabel={copy("userProfile.deleteConfirmationLabel")}
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!busy}
          style={s.input}
        />
        {user.hasPassword ? (
          <AppSheetTextInput
            accessibilityLabel={copy("userProfile.deletePasswordLabel")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!busy}
            style={s.input}
          />
        ) : (
          <Text style={s.hint}>
            {copy("userProfile.deleteGoogleReauthHint")}
          </Text>
        )}
        {!!error && <AuthMessage text={error} />}
        <Pressable
          accessibilityRole="button"
          disabled={!valid || busy}
          onPress={() => void remove()}
          style={[s.logout, (!valid || busy) && { opacity: 0.4 }]}
        >
          <Text style={{ color: "#f87171", fontWeight: "700" }}>
            {copy(
              busy
                ? "userProfile.deletingAccount"
                : "userProfile.confirmDelete",
            )}
          </Text>
        </Pressable>
      </AppSheetScrollView>
    </AppSheet>
  );
}
const s = StyleSheet.create({
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "#ff004466",
    backgroundColor: "#ffffff0d",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  camera: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  member: {
    alignSelf: "flex-start",
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#ffffff1a",
    backgroundColor: "#ffffff0d",
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  section: { fontSize: 18, fontWeight: "600", color: "white" },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 3 },
  empty: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#ffffff1a",
    borderRadius: 16,
  },
  panel: {
    borderRadius: 26,
    backgroundColor: "#ffffff0d",
    borderWidth: 1,
    borderColor: "#ffffff1a",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ffffff0f",
    alignItems: "center",
    justifyContent: "center",
  },
  connect: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#ffffff1a",
    backgroundColor: "#ffffff08",
    padding: 16,
    gap: 16,
  },
  qrIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "#ff00441a",
    borderWidth: 1,
    borderColor: "#ff004433",
    alignItems: "center",
    justifyContent: "center",
  },
  myCode: {
    height: 36,
    borderRadius: 99,
    backgroundColor: "#ffffff0d",
    borderWidth: 1,
    borderColor: "#ffffff26",
    alignItems: "center",
    justifyContent: "center",
  },
  saved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#ffffff1a",
  },
  tabs: {
    padding: 4,
    borderRadius: 99,
    flexDirection: "row",
    backgroundColor: "#ffffff0a",
    borderWidth: 1,
    borderColor: "#ffffff1a",
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 99 },
  input: {
    color: "white",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#ffffff0d",
    borderWidth: 1,
    borderColor: "#ffffff1a",
  },
  form: { padding: 16, gap: 10 },
  logout: {
    padding: 14,
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ef44441a",
    borderWidth: 1,
    borderColor: "#ef444440",
  },
});
