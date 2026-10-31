import { AccentPressable } from '../ui/AccentPressable';
import { GlassPressable } from '../ui/GlassPressable';
import { FormInput as TextInput, formStyles } from '../ui/FormInput';
import { uploadProfileAvatar } from "../profile/avatar";
import { DeleteAccountSheet } from "../profile/DeleteAccountSheet";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable as NativePressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { MotionPressable as Pressable } from "../ui/MotionPressable";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import {
  Bookmark,
  Camera,
  Check,
  CircleAlert,
  ChevronRight,
  CircleHelp,
  FileText,
  Globe2,
  Lock,
  LogOut,
  Mail,
  QrCode,
  Receipt,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Ticket,
  UserRound,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react-native";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import {
  useHiddenCategories,
  PreferencesSheet,
} from "../profile/PreferencesSheet";
import { QuickConnectSheet } from "../profile/QuickConnectSheet";
import { WardrobeCard } from "../wardrobe/WardrobeScreen";
import { ProfileDisclosure, PROFILE_DISCLOSURE_MOTION } from "../profile/ProfileDisclosure";
import { ProfileEmptyState } from '../profile/ProfileEmptyState';
import {
  TicketSheet,
  ticketStatus,
  type UserTicket,
} from "../profile/TicketSheet";
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
import { useNavbarScroll } from '../navigation/useNavbarScroll';
import {ActionButton as UIActionButton} from '../ui/ActionButton';

type ProfileAction = "avatar" | "details" | "password" | "language" | "privacy";
type ProfileNotice = { kind: "error" | "success"; key: string };
const actionMessages: Record<ProfileAction, { success?: string; error: string }> = {
  avatar: { error: "profile.imageUploadFailed" },
  details: { error: "profile.updateFailed" },
  password: { success: "profile.resetSent", error: "profile.resetFailed" },
  language: { error: "profile.languageFailed" },
  privacy: { error: "profile.privacyUpdateFailed" },
};

/** Focus changes update fetching and auth without rebuilding the account UI. */
function ProfileActivity({ watchAdmission }: { watchAdmission: boolean }) {
  const focused = useIsFocused(), auth = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  useTickets(focused, watchAdmission);
  useEffect(() => {
    if (focused && auth.ready && !auth.user) navigation.navigate('Auth', { returnTab: 'Profile' });
  }, [focused, auth.ready, auth.user, navigation]);
  return null;
}

export function ProfileScreen() {
  const navbarScroll = useNavbarScroll();
  const auth = useAuth(),
    { copy, saved, savedLoading, savedError, retrySaved, language, setLanguage, actionError } = usePreferences();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>(),
    safe = useSafeAreaInsets(),
    link = useOpenLink();
  const [row, setRow] = useState(""),
    [sheet, setSheet] = useState<"preferences" | "connect" | "delete" | null>(
      null,
    );
  const [ticket, setTicket] = useState<UserTicket | null>(null),
    [tab, setTab] = useState<"active" | "history">("active");
  const [activeAction, setActiveAction] = useState<ProfileAction | null>(null),
    [notices, setNotices] = useState<Partial<Record<ProfileAction, ProfileNotice>>>({});
  const busy = activeAction !== null;
  const [username, setUsername] = useState(""),
    [bio, setBio] = useState("");
  const tickets = useTickets(false),
    hidden = useHiddenCategories(),
    pending = useRef(false);
  const now = useEventClock();
  const validationEvents = useQuery({ queryKey: ['validation-access', auth.user?.id], enabled: !!auth.user, queryFn: async ({ signal }) => { const result = await accountApi<unknown>('/dashboard/ticket-validation/events', { signal }); if (result === null) return []; if (!Array.isArray(result)) throw new Error('Invalid validation events'); return result; } });
  const activeSafety = tickets.data?.find(ticket => ticket.isValidated && Date.parse(ticket.endTime) + 86400000 >= Date.now());
  useEffect(() => {
    setUsername(auth.user?.username ?? "");
    setBio(auth.user?.bio ?? "");
  }, [auth.user?.id, auth.user?.username, auth.user?.bio]);
  useEffect(() => {
    setRow("");
    setSheet(null);
    setTicket(null);
    setNotices({});
    setTab("active");
  }, [auth.user?.id]);
  const groups = useMemo(() => profileTicketGroups(tickets.data ?? [], tab, now), [tickets.data, tab, now]);
  if (!auth.ready || !auth.user) return <><ProfileActivity watchAdmission={false} /><Loading /></>;
  const user = auth.user,
    activeTickets = (tickets.data ?? []).filter(
      (item) => ticketStatus(item, now) === "active",
    );
  const explore = () => navigation.navigate('Tabs', { screen: 'Explore' });
  const clearNotice = (action: ProfileAction) =>
    setNotices(old => ({ ...old, [action]: undefined }));
  const run = async (action: ProfileAction, operation: () => Promise<unknown>) => {
    if (pending.current) return;
    pending.current = true;
    setActiveAction(action);
    clearNotice(action);
    const token = auth.controller.getToken();
    try {
      const result = await operation();
      // Cancelled image picking and stale session updates are not successful saves.
      if (auth.controller.getToken() !== token || result === false || result === null) return false;
      const successMessage = actionMessages[action].success;
      if (successMessage)
        setNotices(old => ({ ...old, [action]: { kind: "success", key: successMessage } }));
      return true;
    } catch (cause) {
      if (auth.controller.getToken() === token)
        setNotices(old => ({ ...old, [action]: {
          kind: "error",
          key: cause instanceof Error && cause.message.startsWith("profile.")
            ? cause.message : actionMessages[action].error,
        } }));
      return false;
    } finally {
      pending.current = false;
      setActiveAction(null);
    }
  };
  const avatar = () => run("avatar", () => uploadProfileAvatar(auth.controller));
  const selectLanguage = async (next: "ro" | "en") => {
    if (pending.current) return;
    if (next === language) { setRow(""); return; }
    const saved = await run("language", async () => {
      const updated = await auth.controller.update({ preferredLanguage: next });
      if (updated) setLanguage(next);
      return updated;
    });
    if (saved) setRow("");
  };
  const toggle = (key: string) => {
    if (pending.current) return;
    Keyboard.dismiss();
    setRow((old) => (old === key ? "" : key));
  };
  return (
    <>
      <ProfileActivity watchAdmission={!!ticket} />
      <ScrollView
        {...navbarScroll}
        testID="profile-list"
        keyboardShouldPersistTaps="handled"
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
            <UIActionButton
              accessibilityRole="button"
              accessibilityLabel={copy("profile.changeAvatar")}
              disabled={busy}
              onPress={() => void avatar()}
              style={s.camera}
            >
              {activeAction === "avatar" ? <ActivityIndicator size="small" color="white" /> : <Camera size={17} color="white" />}
            </UIActionButton>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
            <Text numberOfLines={1} style={{ color: "white", fontWeight: "600", fontSize: 24 }}>
              {user.username}
            </Text>
            <View
              style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
            >
              <Mail size={14} color={colors.muted} />
              <Text
                numberOfLines={1}
                style={{ color: colors.muted, fontSize: 14, flexShrink: 1 }}
              >
                {user.email}
              </Text>
            </View>
            <View style={s.member}>
              <Sparkles size={12} color={colors.accent} />
              <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11, flexShrink: 1 }}>
                {copy("userProfile.memberSince", {
                  year: new Date(user.createdAt).getFullYear(),
                })}
              </Text>
            </View>
          </View>
          <GlassPressable fallback={Pressable}
            testID="profile-quick-connect"
            accessibilityRole="button"
            accessibilityLabel={copy("qr.quickConnect")}
            accessibilityHint={copy("qr.showOrScan")}
            onPress={() => setSheet("connect")}
            style={s.quickConnect}
          >
            <QrCode size={20} color={colors.accent} />
          </GlassPressable>
        </View>
        <ProfileFeedback action="avatar" notice={notices.avatar} />
        {auth.storageError && <AuthMessage text={copy("feedback.actionFailed")} />}
        {user.role !== "user" && (
          <Row
            icon={UserRound}
            title={copy("profile.yourAccount")}
            onPress={() => user.role === 'admin' ? navigation.navigate('Admin') : navigation.navigate('Dashboard', { section: 'profile' })}
          />
        )}
        {user.role !== 'organizer' && activeSafety && <Pressable accessibilityRole="button" testID="profile-safety-group" onPress={() => navigation.navigate('SafetyGroup', { eventId: activeSafety.eventId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 26, borderWidth: 1, borderColor: '#34d3994d', backgroundColor: '#34d39917' }}><ShieldCheck size={26} color="#34d399"/><View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{copy('safetyGroup.activeEvent', { event: activeSafety.eventTitle })}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{copy('safetyGroup.openGroup')}</Text></View><ChevronRight size={16} color="#6ee7b7"/></Pressable>}
        <WardrobeCard />
        {user.role !== 'organizer' && !!validationEvents.data?.length && <Row icon={QrCode} title={copy('userProfile.ticketValidation')} hint={copy('userProfile.validationAccess', { count: validationEvents.data.length })} onPress={() => navigation.navigate('Scanner')}/>}
        <View style={{ gap: 12 }}>
          <Text style={s.section}>{copy("userProfile.ticketsOrders")}</Text>
          <View style={s.tabs}>
            {(["active", "history"] as const).map((value) => (
              <AccentPressable fallback={Pressable}
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
              </AccentPressable>
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
            <ProfileEmptyState testID="profile-empty-tickets" icon={Ticket}
              title={copy(tab === 'active' ? 'userProfile.noActiveTickets' : 'tickets.noHistory')}
              onExplore={explore} />
          )}
          {(tickets.isPending || tickets.isError || !!tickets.data?.length) && <Pressable testID="profile-tickets-all" accessibilityRole="button" onPress={() => navigation.navigate("Tabs", {screen:"Profile",params:{screen:"Tickets"}})} style={{minHeight:44,alignItems:"center",justifyContent:"center",borderRadius:99,borderWidth:1,borderColor:"#ffffff1a"}}><Text style={{color:"white",fontSize:14,fontWeight:"600"}}>{copy("userProfile.viewAllTickets")}</Text></Pressable>}
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
          <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><Text style={s.section}>{copy("userProfile.savedEvents")}</Text>{saved.length > 4 && <Pressable accessibilityRole="button" testID="profile-saved-all" onPress={() => navigation.navigate("Tabs", {screen:"Profile",params:{screen:"SavedEvents"}})} style={{minHeight:44,justifyContent:"center"}}><Text style={{fontSize:12,color:colors.accent}}>{copy("common.seeAll")}</Text></Pressable>}</View>
          {actionError && <AuthMessage text={copy("feedback.actionFailed")} />}
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
            <ProfileEmptyState testID="profile-empty-saved" icon={Bookmark} title={copy('userProfile.noSavedEvents')} onExplore={explore} />
          )}
        </View>
        <View style={{ gap: 12 }}>
          <Text style={s.section}>{copy("userProfile.accountSecurity")}</Text>
          <View testID="profile-account-settings" style={s.panel}>
            <Row
              testID="profile-details-toggle"
              icon={UserRound}
              title={copy("userProfile.personalDetails")}
              hint={copy("userProfile.personalDetailsHint")}
              expanded={row === "details"}
              onPress={() => toggle("details")}
            />
            <ProfileDisclosure expanded={row === "details"} testID="profile-details-content">
              <View style={s.form}>
                <Text style={formStyles.profileLabel}>{copy("profile.displayName")}</Text>
                <TextInput variant="profile"
                  invalid={notices.details?.key === "profile.displayNameTooShort"}
                  accessibilityLabel={copy("profile.displayName")}
                  value={username}
                  onChangeText={value => { setUsername(value); clearNotice("details"); }}
                  editable={!busy}
                  maxLength={50}
                  style={s.input}
                />
                {notices.details?.key === "profile.displayNameTooShort" && <ProfileFeedback action="details" notice={notices.details} />}
                <Text style={formStyles.profileLabel}>{copy("profile.bio")}</Text>
                <TextInput variant="profile"
                  placeholder={copy("profile.bioPlaceholder")}
                  accessibilityLabel={copy("profile.bio")}
                  value={bio}
                  onChangeText={value => { setBio(value); clearNotice("details"); }}
                  editable={!busy}
                  maxLength={500}
                  multiline
                  style={[s.input, { minHeight: 84 }]}
                />
                <AuthButton
                  testID="profile-details-save"
                  compact
                  title={copy(activeAction === "details" ? "profile.saving" : "profile.saveChanges")}
                  busy={busy}
                  onPress={() =>
                    void run("details", async () => {
                      if (username.trim().length < 3)
                        throw new Error("profile.displayNameTooShort");
                      return auth.controller.update({
                        username: username.trim(),
                        bio: bio.trim(),
                      });
                    })
                  }
                />
                {notices.details?.key !== "profile.displayNameTooShort" && <ProfileFeedback action="details" notice={notices.details} />}
              </View>
            </ProfileDisclosure>
            <Row
              testID="profile-password-toggle"
              separator
              icon={Lock}
              title={copy("userProfile.changePassword")}
              expanded={row === "password"}
              onPress={() => toggle("password")}
            />
            <ProfileDisclosure expanded={row === "password"} testID="profile-password-content">
              <View style={s.form}>
                <Text style={s.hint}>
                  {copy("profile.resetHint", { email: user.email })}
                </Text>
                <AuthButton
                  testID="profile-password-send"
                  title={copy(activeAction === "password" ? "profile.sending" : "profile.resetPassword")}
                  busy={busy}
                  onPress={() =>
                    void run("password", () =>
                      accountApi("/auth/forgot-password", {
                        method: "POST",
                        body: { email: user.email },
                        token: null,
                      }))
                  }
                />
                <ProfileFeedback action="password" notice={notices.password} />
              </View>
            </ProfileDisclosure>
            <Row
              testID="profile-language-toggle"
              separator
              icon={Globe2}
              title={copy("profile.language")}
              hint={language === "ro" ? "Română" : "English"}
              disabled={busy}
              expanded={row === "language"}
              onPress={() => toggle("language")}
            />
            <ProfileDisclosure expanded={row === "language"} testID="profile-language-content">
              <View accessibilityRole="radiogroup" accessibilityLabel={copy("profile.language")} style={s.languageMenu}>
                {(["ro", "en"] as const).map(value => (
                  <NativePressable
                    key={value}
                    testID={`profile-language-${value}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: language === value, disabled: busy }}
                    aria-checked={language === value}
                    disabled={busy}
                    onPress={() => void selectLanguage(value)}
                    style={({ pressed }) => [s.languageOption, { backgroundColor: language === value ? "#ff004414" : pressed ? "#ffffff08" : "transparent", opacity: busy ? 0.5 : 1 }]}
                  >
                    <Text style={{ color: language === value ? colors.accent : colors.text, fontSize: 14 }}>{value === "ro" ? "Română" : "English"}</Text>
                    {language === value && <Check size={17} color={colors.accent} />}
                  </NativePressable>
                ))}
              </View>
            </ProfileDisclosure>
            {activeAction === "language" && <View style={s.rowFeedback}><Text accessibilityLiveRegion="polite" style={s.hint}>{copy("profile.saving")}</Text></View>}
            {notices.language && <View style={s.rowFeedback}><ProfileFeedback action="language" notice={notices.language} /></View>}
            {user.role === "user" && (
              <Row
                separator
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
              separator
              icon={UsersRound}
              title={copy("profile.attendancePrivacy")}
              hint={copy(
                user.showAttendancePublicly
                  ? "profile.attendanceVisible"
                  : "profile.attendanceHidden",
              )}
              trailing={
                <Switch
                  testID="profile-privacy-switch"
                  accessibilityLabel={copy("profile.attendancePrivacy")}
                  value={user.showAttendancePublicly}
                  disabled={busy}
                  trackColor={{ true: colors.accent, false: "#333" }}
                  onValueChange={(value) =>
                    void run("privacy", () =>
                      auth.controller.update({ showAttendancePublicly: value }),
                    )
                  }
                />
              }
            />
            {notices.privacy && <View style={s.rowFeedback}><ProfileFeedback action="privacy" notice={notices.privacy} /></View>}
            <Row
              testID="profile-delete-account"
              separator
              icon={Trash2}
              title={copy("userProfile.deleteAccount")}
              danger
              onPress={() => setSheet("delete")}
            />
          </View>
        </View>
        <View style={{ gap: 12 }}>
          <Text style={s.section}>{copy("userProfile.supportLegal")}</Text>
          <View testID="profile-support-settings" style={s.panel}>
            <Row
              testID="profile-help-toggle"
              icon={CircleHelp}
              title={copy("userProfile.helpSupport")}
              hint={copy("userProfile.helpHint")}
              expanded={row === "help"}
              onPress={() => toggle("help")}
            />
            <ProfileDisclosure expanded={row === "help"} testID="profile-help-content">
              <Text style={[s.hint, s.help]}>
                {copy("userProfile.helpText")}
              </Text>
            </ProfileDisclosure>
            <Row
              separator
              icon={FileText}
              title={copy("userProfile.terms")}
              onPress={() => navigation.navigate('Legal', { document: 'terms' })}
            />
            <Row
              separator
              icon={ShieldCheck}
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
      {sheet === "delete" && <DeleteAccountSheet key={user.id} onClose={() => setSheet(null)} />}
      {ticket && (
        <TicketSheet
          initialId={ticket.id}
          preferUnused={tab === 'active'}
          offline={tickets.offline}
          savedAt={tickets.savedAt}
          tickets={(tickets.data ?? []).filter(item => item.eventId === ticket.eventId)}
          onClose={() => setTicket(null)}
        />
      )}
    </>
  );
}
function ProfileFeedback({ action, notice }: { action: ProfileAction; notice?: ProfileNotice }) {
  const { copy } = usePreferences();
  if (!notice) return null;
  const color = notice.kind === "error" ? "#f87171" : "#34d399";
  const Icon = notice.kind === "error" ? CircleAlert : Check;
  return (
    <View testID={`profile-${action}-feedback`} style={s.feedback}>
      <Icon size={15} color={color} style={{ marginTop: 2 }} />
      <Text accessibilityRole={notice.kind === "error" ? "alert" : undefined} accessibilityLiveRegion="polite" style={{ color, fontSize: 12, lineHeight: 18, flex: 1 }}>
        {copy(notice.key)}
      </Text>
    </View>
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
  expanded,
  separator,
  testID,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  expanded?: boolean;
  separator?: boolean;
  testID?: string;
}) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withTiming(expanded ? 90 : 0, PROFILE_DISCLOSURE_MOTION);
    return () => cancelAnimation(rotation);
  }, [expanded, rotation]);
  const chevronMotion = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  const foreground = danger ? "#f87171" : expanded ? colors.accent : colors.text;
  const content = (
    <>
      <View style={s.rowIcon}>
        <Icon size={19} color={danger || expanded ? foreground : colors.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: foreground,
            fontSize: 14,
            lineHeight: 20,
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        {hint && <Text style={s.hint}>{hint}</Text>}
      </View>
      {trailing ?? <Animated.View style={chevronMotion}><ChevronRight size={16} color={expanded ? colors.accent : colors.muted} /></Animated.View>}
    </>
  );
  return (
    <View>
      {separator && <View style={s.separator} />}
      {onPress ? (
        <NativePressable
          testID={testID}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!disabled, ...(expanded === undefined ? {} : { expanded }) }}
          aria-expanded={expanded}
          onPress={onPress}
          disabled={disabled}
          style={({ pressed }) => [s.row, { backgroundColor: expanded ? "#ff00440a" : pressed ? "#ffffff08" : "transparent", opacity: disabled ? 0.5 : 1 }]}
        >
          {content}
        </NativePressable>
      ) : (
        <View style={s.row}>{content}</View>
      )}
    </View>
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
    maxWidth: "100%",
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
  panel: {
    borderRadius: 22,
    backgroundColor: "#09090b",
    overflow: "hidden",
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: "#ffffff0a", marginLeft: 48, marginRight: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 60,
  },
  rowIcon: {
    width: 20,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  quickConnect: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignSelf: 'center',
    borderRadius: 22,
    backgroundColor: "#ffffff0d",
    borderWidth: 1,
    borderColor: "#ffffff1a",
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
  input: formStyles.profile,
  form: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20, gap: 10 },
  languageMenu: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 4 },
  languageOption: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  feedback: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  rowFeedback: { paddingHorizontal: 16, paddingBottom: 16 },
  help: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20, marginTop: 0, lineHeight: 20 },
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
