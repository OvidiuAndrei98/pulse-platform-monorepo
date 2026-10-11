import { FormScrollView } from "../ui/KeyboardForms";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from "react-native";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LockKeyhole,
  Mail,
  UserRound,
  X,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth, accountApi } from "../auth/AuthProvider";
import { validPassword } from "../auth/session";
import { ApiError } from "../data/http";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { Logo } from "../ui/Logo";
import { EventImage } from "../ui/common";
import { colors } from "../ui/theme";
import type { RootParamList } from "../navigation/types";
import { isEventId } from "../data/events";
import { returnToEvent } from "../navigation/returnToEvent";
import { GoogleButton } from '../auth/GoogleButton';

export function AuthScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootParamList, "Auth">) {
  const { copy } = usePreferences(),
    auth = useAuth(),
    safe = useSafeAreaInsets();
  const mode = route.params?.mode ?? "login";
  const activation = route.params?.activation;
  const [emailForm, setEmailForm] = useState(activation === "success");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [username, setUsername] = useState(""),
    [organizer, setOrganizer] = useState(false),
    [company, setCompany] = useState(""),
    [cui, setCui] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const pending = useRef(false),
    revision = useRef(0);
  useEffect(
    () => () => auth.controller.cancelPendingLogin(),
    [auth.controller],
  );
  useEffect(() => {
    revision.current++;
    setError("");
    setSent(false);
    setPassword("");
    setConfirm("");
    return () => {
      revision.current++;
    };
  }, [mode]);
  useEffect(() => {
    if (!auth.ready || !auth.user || (mode !== "login" && mode !== "register")) return;
    // Never back into a protected screen on close/logout; authenticated return
    // destinations are a typed tab, never a URL supplied by a third party.
    if (isEventId(route.params?.returnSafetyGroup)) navigation.popTo('SafetyGroup', { eventId: route.params.returnSafetyGroup }, { merge: true });
    else if (route.params?.returnScanner) navigation.popTo('Scanner', undefined);
    else if (isEventId(route.params?.returnProfile)) navigation.popTo('PublicProfile', { id: route.params.returnProfile }, { merge: true });
    else if (isEventId(route.params?.returnEvent)) returnToEvent(navigation, route.params.returnEvent);
    else if (route.params?.returnDashboard) navigation.popTo('Dashboard', typeof route.params.returnDashboardParams === 'object' ? route.params.returnDashboardParams : undefined);
    else if (!route.params?.returnTab && auth.user.role === 'admin') navigation.popTo('Admin', undefined);
    else if (!route.params?.returnTab && auth.user.role === 'organizer') navigation.popTo('Dashboard', undefined);
    else navigation.popTo("Tabs", { screen: route.params?.returnTab ?? "Profile" });
  }, [auth.ready, auth.user, mode, navigation, route.params?.returnTab, route.params?.returnEvent, route.params?.returnProfile, route.params?.returnSafetyGroup, route.params?.returnScanner, route.params?.returnDashboard, route.params?.returnDashboardParams]);
  const go = (next: "login" | "register" | "forgot" | "reset") => {
    if (!pending.current && !auth.busy) navigation.setParams({ mode: next });
  };
  const close = () => isEventId(route.params?.returnProfile)
    ? navigation.popTo('PublicProfile', { id: route.params.returnProfile }, { merge: true })
    : isEventId(route.params?.returnEvent)
    ? returnToEvent(navigation, route.params.returnEvent)
    : navigation.popTo("Tabs", { screen: "Home" });
  const form = mode !== "login" || emailForm;
  const submit = async () => {
    if (pending.current || auth.busy) return;
    setError("");
    if (mode !== "reset" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(copy("auth.emailPlaceholder"));
      return;
    }
    if ((mode === "register" || mode === "reset") && !validPassword(password)) {
      setError(copy("auth.shortPassword"));
      return;
    }
    if ((mode === "register" || mode === "reset") && password !== confirm) {
      setError(copy("auth.passwordsMismatch"));
      return;
    }
    if (mode === "login" && !password) {
      setError(copy("auth.passwordPlaceholder"));
      return;
    }
    if (
      mode === "register" &&
      (username.trim().length < 3 || username.trim().length > 50)
    ) {
      setError(copy("profile.displayNameTooShort"));
      return;
    }
    if (mode === "register" && organizer && (!company.trim() || !cui.trim())) {
      setError(copy("auth.organizerDetailsRequired"));
      return;
    }
    if (mode === "reset" && !route.params?.token) {
      setError(copy("auth.invalidReset"));
      return;
    }
    pending.current = true;
    setBusy(true);
    const version = revision.current;
    try {
      if (mode === "login") await auth.controller.login(email, password);
      if (mode === "register")
        await accountApi("/auth/register", {
          method: "POST",
          token: null,
          body: {
            username: username.trim(),
            email: email.trim(),
            password,
            requestOrganizerRole: organizer,
            ...(organizer
              ? { companyName: company.trim(), cui: cui.trim() }
              : {}),
          },
        });
      if (mode === "forgot")
        await accountApi("/auth/forgot-password", {
          method: "POST",
          token: null,
          body: { email: email.trim() },
        });
      if (mode === "reset")
        await accountApi("/auth/reset-password", {
          method: "POST",
          token: null,
          body: { token: route.params?.token, new_password: password },
        });
      if (version === revision.current && mode !== "login") {
        setSent(true);
        setPassword("");
        setConfirm("");
      }
    } catch (cause) {
      if (version === revision.current)
        setError(
          copy(
            mode === "login"
              ? cause instanceof ApiError && cause.status === 401
                ? "auth.invalidCredentials"
                : "common.loginFailed"
              : mode === "register"
                ? "auth.registrationFailed"
                : mode === "forgot"
                  ? "auth.resetRequestFailed"
                  : "auth.passwordResetFailed",
          ),
        );
    } finally {
      pending.current = false;
      if (version === revision.current) setBusy(false);
    }
  };
  const title =
    mode === "register"
      ? "auth.createProfile"
      : mode === "forgot"
        ? "auth.forgotPasswordTitle"
        : mode === "reset"
          ? "auth.choosePassword"
          : "auth.welcomeBack";
  const action =
    mode === "register"
      ? "auth.createAccount"
      : mode === "forgot"
        ? "auth.sendResetLink"
        : mode === "reset"
          ? "auth.updatePassword"
          : "auth.signIn";
  return (
    <View
      testID="auth-screen"
      style={s.screen}
    >
      {!form && (
        <>
          <EventImage style={StyleSheet.absoluteFill} />
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: "#00000073" }]}
          />
          <LinearGradient
            colors={["#00000033", "#00000014", "#000000e0"]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      <FormScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: Math.max(24, safe.top + 16),
          paddingBottom: Math.max(32, safe.bottom + 24),
        }}
      >
        <Pressable
          accessibilityRole="button"
          testID="auth-back"
          accessibilityLabel={copy("common.back")}
          disabled={busy}
          onPress={() =>
            mode !== "login"
              ? go("login")
              : emailForm
                ? setEmailForm(false)
                : close()
          }
          style={s.back}
        >
          {form ? (
            <>
              <ArrowLeft size={16} color="white" />
              <Text style={s.backText}>{copy("common.back")}</Text>
            </>
          ) : (
            <X size={24} color="white" />
          )}
        </Pressable>
        {!form && (
          <View style={s.hero}>
            <Logo size={80} />
            <Text style={s.wordmark}>
              SPOTTR<Text style={{ color: colors.accent }}>.</Text>
            </Text>
            <Text style={s.tagline}>{copy("auth.tagline")}</Text>
            <Text style={s.pitch}>{copy("auth.loginHero")}</Text>
          </View>
        )}
        <View
          style={[
            {
              gap: 20,
              marginVertical: form ? "auto" : 0,
              paddingVertical: form ? 30 : 0,
            },
            mode === "register" && { marginVertical: 0 },
          ]}
        >
          {!!activation && mode === "login" && (
            <AuthMessage
              success={activation === "success"}
              text={copy("auth.activationResult." + activation)}
            />
          )}
          {sent ? (
            <View style={{ gap: 16 }}>
              <CheckCircle2 color={colors.accent} size={48} />
              <Text style={s.title}>
                {copy(
                  mode === "register"
                    ? "auth.activationTitle"
                    : mode === "forgot"
                      ? "auth.resetLinkSent"
                      : "auth.passwordUpdated",
                )}
              </Text>
              {mode !== "reset" && (
                <Text style={s.hint}>
                  {copy(
                    mode === "register"
                      ? "auth.activationText"
                      : "auth.resetLinkSentHint",
                    { email: email.trim() },
                  )}
                </Text>
              )}
              {mode === "register" && organizer && (
                <Text style={s.hint}>
                  {copy("auth.organizerPendingAfterActivation")}
                </Text>
              )}
              <AuthButton
                title={copy("auth.goToLogin")}
                onPress={() => {
                  go("login");
                  setEmailForm(true);
                }}
              />
            </View>
          ) : form ? (
            <>
              <View>
                <Text style={s.eyebrow}>
                  {copy(
                    mode === "register" ? "auth.newAccount" : "auth.account",
                  ).toUpperCase()}
                </Text>
                <Text style={s.title}>{copy(title)}</Text>
                {mode !== "login" && (
                  <Text style={s.hint}>
                    {copy(
                      mode === "register"
                        ? "auth.registerHint"
                        : mode === "forgot"
                          ? "auth.forgotPasswordHint"
                          : "auth.resetHint",
                    )}
                  </Text>
                )}
              </View>
              {mode === "register" && (
                <AuthField
                  label={copy("auth.username")}
                  value={username}
                  onChangeText={setUsername}
                  icon={<UserRound size={16} color="#ffffffb3" />}
                  maxLength={50}
                  autoComplete="username"
                  editable={!busy}
                />
              )}
              {mode !== "reset" && (
                <AuthField
                  testID="auth-email"
                  label={copy("auth.email")}
                  value={email}
                  onChangeText={setEmail}
                  icon={<Mail size={16} color="#ffffffb3" />}
                  keyboardType="email-address"
                  autoComplete="email"
                  maxLength={100}
                  editable={!busy}
                />
              )}
              {mode !== "forgot" && (
                <AuthField
                  testID="auth-password"
                  label={copy(
                    mode === "reset" ? "auth.newPassword" : "auth.password",
                  )}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  icon={<LockKeyhole size={16} color="#ffffffb3" />}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  editable={!busy}
                />
              )}
              {(mode === "register" || mode === "reset") && (
                <AuthField
                  label={copy("auth.confirmPassword")}
                  value={confirm}
                  onChangeText={setConfirm}
                  secureTextEntry
                  icon={<LockKeyhole size={16} color="#ffffffb3" />}
                  autoComplete="new-password"
                  editable={!busy}
                />
              )}
              {mode === "login" && (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy || auth.busy}
                  onPress={() => go("forgot")}
                >
                  <Text style={s.pink}>{copy("auth.forgotPassword")}</Text>
                </Pressable>
              )}
              {mode === "register" && (
                <>
                  <View style={s.organizer}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.label}>
                        {copy("auth.organizerAccount")}
                      </Text>
                      <Text style={s.hint}>{copy("auth.organizerHint")}</Text>
                    </View>
                    <Switch
                      accessibilityLabel={copy("auth.organizerAccount")}
                      value={organizer}
                      onValueChange={setOrganizer}
                      disabled={busy}
                      trackColor={{ true: colors.accent, false: "#333" }}
                    />
                  </View>
                  {organizer && (
                    <>
                      <AuthField
                        label={copy("auth.companyName")}
                        value={company}
                        onChangeText={setCompany}
                        maxLength={255}
                        editable={!busy}
                      />
                      <AuthField
                        label={copy("auth.cui")}
                        value={cui}
                        onChangeText={setCui}
                        maxLength={12}
                        editable={!busy}
                      />
                      <Text style={s.hint}>
                        {copy("auth.manualVerificationHint")}
                      </Text>
                    </>
                  )}
                </>
              )}
              {!!error && <AuthMessage text={error} />}
              <AuthButton
                testID="auth-submit"
                title={copy(action)}
                onPress={() => void submit()}
                busy={busy || auth.busy}
              />
              {mode === "register" && <GoogleButton organizer={organizer} company={company} cui={cui} disabled={busy || auth.busy} onError={setError} />}
              {mode === "register" && (
                <Text style={s.terms}>
                  {copy("auth.termsPrefix")}{" "}
                  <Text
                    style={s.pink}
                    onPress={() => navigation.navigate('Legal', { document: 'terms' })}
                  >
                    {copy("auth.terms")}
                  </Text>{" "}
                  {copy("auth.and")}{" "}
                  <Text
                    style={s.pink}
                    onPress={() => navigation.navigate('Legal', { document: 'privacy' })}
                  >
                    {copy("auth.privacy")}
                  </Text>
                  .
                </Text>
              )}
            </>
          ) : (
            <><GoogleButton disabled={busy || auth.busy} onError={setError} />
            {!!error && <AuthMessage text={error} />}
            <AuthButton
              testID="auth-email-choice"
              title={copy("auth.continueWithEmail")}
              icon={<Mail size={20} color="white" />}
              onPress={() => setEmailForm(true)}
            /></>
          )}
        </View>
        {!sent && (mode === "login" || mode === "register") && (
          <View style={s.bottom}>
            <Text style={s.hint}>
              {copy(mode === "login" ? "auth.noAccount" : "auth.haveAccount")}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => go(mode === "login" ? "register" : "login")}
            >
              <Text style={s.pink}>
                {copy(mode === "login" ? "auth.createAccount" : "auth.signIn")}
              </Text>
            </Pressable>
          </View>
        )}
      </FormScrollView>
    </View>
  );
}
export function AuthField({
  label,
  icon,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={s.field}>
        {icon}
        <TextInput
          {...props}
          accessibilityLabel={label}
          autoCapitalize={props.autoCapitalize ?? "none"}
          autoCorrect={false}
          placeholderTextColor="#ffffff73"
          style={[s.input, props.style]}
        />
      </View>
    </View>
  );
}
export function AuthButton({
  title,
  onPress,
  busy,
  icon,
  testID,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  icon?: React.ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        { opacity: busy || pressed ? 0.6 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color="white" /> : icon}
      <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>
        {title}
      </Text>
      {!busy && !icon && <ArrowRight size={16} color="white" />}
    </Pressable>
  );
}
export function AuthMessage({
  text,
  success = false,
}: {
  text: string;
  success?: boolean;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderRadius: 16,
        padding: 14,
        backgroundColor: success ? "#16a34a20" : "#ef444420",
      }}
    >
      <Text
        style={{
          fontSize: 13,
          lineHeight: 20,
          color: success ? "#bbf7d0" : "#fca5a5",
        }}
      >
        {text}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  back: {
    height: 48,
    minWidth: 48,
    alignSelf: "flex-start",
    borderRadius: 99,
    backgroundColor: "#00000059",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  backText: { color: "white", fontSize: 14, fontWeight: "500" },
  hero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 40,
    paddingTop: 32,
  },
  wordmark: {
    color: "white",
    fontSize: 48,
    fontWeight: "600",
    letterSpacing: -2.8,
    marginTop: 20,
  },
  tagline: {
    color: "#ffffffe6",
    fontSize: 18,
    fontWeight: "500",
    marginTop: 12,
  },
  pitch: {
    color: "#ffffffe6",
    fontSize: 20,
    fontWeight: "500",
    lineHeight: 25,
    maxWidth: 256,
    marginTop: 36,
    textAlign: "center",
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2.16,
  },
  title: {
    fontSize: 30,
    fontWeight: "600",
    letterSpacing: -0.75,
    color: "white",
    marginTop: 8,
  },
  hint: { color: "#ffffff99", fontSize: 14, lineHeight: 22, marginTop: 6 },
  pink: { color: colors.accent, fontSize: 14, fontWeight: "600" },
  label: { color: "white", fontSize: 14, fontWeight: "600" },
  fieldLabel: {
    color: "#ffffffa6",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.92,
  },
  field: {
    height: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffff33",
    backgroundColor: "#00000066",
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "white",
  },
  button: {
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  bottom: {
    marginTop: 28,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  organizer: { flexDirection: "row", gap: 12, alignItems: "center" },
  terms: {
    fontSize: 12,
    color: "#ffffff99",
    textAlign: "center",
    lineHeight: 20,
  },
});
