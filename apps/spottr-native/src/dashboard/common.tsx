import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  Platform,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIsFocused } from "@react-navigation/native";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  type LucideIcon,
} from "lucide-react-native";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { FormInput, formStyles } from '../ui/FormInput';
import { colors as appColors } from "../ui/theme";
import { DashboardDropdown } from "./DashboardDropdown";
import { createDashboardApi } from "./data";
export const dashboardApi = createDashboardApi(accountApi);
// sRGB equivalents of the original dashboard's --foreground and --muted-foreground.
export const dColors = { ...appColors, text: "#f7faf2", muted: "#9ca89e" };
const colors = dColors;
export function useDashboardQuery<T>(
  path: string,
  enabled = true,
  interval?: number,
) {
  const { user } = useAuth(),
    focused = useIsFocused();
  return useQuery({
    queryKey: ["dashboard", user?.id, path],
    enabled: !!user && enabled,
    queryFn: ({ signal }) => accountApi<T>(path, { signal }),
    refetchInterval: focused ? interval : false,
  });
}
/** A synchronous lock prevents duplicate taps; no completion updates a later session. */
export function useAction() {
  const { controller, user } = useAuth(),
    client = useQueryClient(),
    { copy } = usePreferences();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false),
    lock = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    generation.current++;
    lock.current = false;
    setBusy(false);
    setMessage("");
    return () => {
      generation.current++;
    };
  }, [user?.id]);
  async function run<T>(
    fn: () => Promise<T>,
    success?: string,
    onSuccess?: (value: T) => void,
  ) {
    if (lock.current || !controller.getToken()) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setFailed(false);
    const token = controller.getToken(),
      version = generation.current;
    try {
      const value = await fn();
      if (version !== generation.current || token !== controller.getToken())
        return;
      void client.invalidateQueries({ queryKey: ["dashboard", user?.id] });
      // Home deliberately ignores tab/focus refetches. An organizer mutation
      // must refresh it explicitly, along with mounted public event details.
      for (const key of ["public-profile", "profile", "events", "home-events", "event", "organizer-events", "organizer-updates"])
        void client.invalidateQueries({ queryKey: [key] });
      if (success) setMessage(copy(success));
      onSuccess?.(value);
      return value;
    } catch (error) {
      if (version === generation.current && token === controller.getToken()) {
        setFailed(true);
        setMessage(copy("feedback.actionFailed"));
      }
    } finally {
      if (version === generation.current) {
        setBusy(false);
        lock.current = false;
      }
    }
  }
  return {
    busy,
    run,
    clear: () => setMessage(""),
    feedback: message ? (
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: failed ? colors.danger : colors.accent,
          fontSize: 13,
          lineHeight: 20,
        }}
      >
        {message}
      </Text>
    ) : null,
  };
}
export function Heading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ gap: 5, marginBottom: 8 }}>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}
    </View>
  );
}
export function Card({
  children,
  style,
  testID,
}: React.PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  return (
    <View testID={testID} style={[s.card, style]}>
      {children}
    </View>
  );
}
export function Action({
  title,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  icon: Icon,
  style,
  textStyle,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.action,
        secondary && {
          backgroundColor: "#ffffff08",
          borderWidth: 1,
          borderColor: "#ffffff1a",
        },
        danger && {
          backgroundColor: "#ef444414",
          borderWidth: 1,
          borderColor: "#ef444455",
        },
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {Icon && (
        <Icon
          size={16}
          color={
            (StyleSheet.flatten(textStyle)?.color as string) ||
            (danger ? "#fca5a5" : colors.text)
          }
        />
      )}
      <Text
        style={[
          {
            color: danger ? "#fca5a5" : colors.text,
            fontWeight: "600",
            fontSize: 14,
            textAlign: "center",
          },
          textStyle,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  numeric = false,
  password = false,
  error,
  disabled = false,
  placeholder,
  hideLabel = false,
  inputStyle,
  style,
  testID,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  numeric?: boolean;
  password?: boolean;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  hideLabel?: boolean;
  inputStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  maxLength?: number;
}) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {(!hideLabel || !!error) && <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 }}>
        {!hideLabel && <Text style={s.label}>{label}</Text>}
        {!!error && <Text accessibilityRole="alert" style={formStyles.error}>{error}</Text>}
      </View>}
      <FormInput
        invalid={!!error}
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        keyboardType={numeric ? "decimal-pad" : "default"}
        secureTextEntry={password}
        editable={!disabled}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={maxLength}
        style={[
          s.input,
          multiline && {
            minHeight: 104,
            textAlignVertical: "top",
            paddingTop: 12,
          },
          error ? { borderColor: colors.danger } : null,
          disabled && { opacity: 0.5 },
          Platform.OS === "web" && ({ outlineStyle: "none" } as never),
          inputStyle,
        ]}
      />
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={s.row}>
      <Text style={[s.label, { flex: 1 }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.raised, true: colors.accent }}
        thumbColor="white"
      />
    </View>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
  placeholder,
  icon: Icon,
  error,
  testID,
  style,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  icon?: LucideIcon;
  error?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { copy } = usePreferences();
  return (
    <DashboardDropdown
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder || copy("eventForm.categoryPlaceholder")}
      icon={Icon}
      error={error}
      testID={testID}
      triggerStyle={style}
    />
  );
}
export function Confirm({
  title,
  detail,
  onConfirm,
  onClose,
  busy = false,
}: {
  title: string;
  detail: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const { copy } = usePreferences();
  return (
    <Modal
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000cc",
          padding: 16,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={{
            width: "100%",
            maxWidth: 384,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "#ffffff1a",
            backgroundColor: "#171717",
            padding: 24,
            gap: 16,
          }}
        >
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <View
              style={{
                padding: 10,
                borderRadius: 24,
                backgroundColor: "#ef44441a",
              }}
            >
              <AlertTriangle size={24} color="#f87171" />
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 18,
                fontWeight: "600",
                color: "#f87171",
              }}
            >
              {title}
            </Text>
          </View>
          <Text style={{ fontSize: 12, lineHeight: 20, color: colors.muted }}>
            {detail}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, paddingTop: 8 }}>
            <Action
              title={copy("common.cancel")}
              onPress={onClose}
              disabled={busy}
              secondary
              style={{
                flex: 1,
                borderRadius: 24,
                minHeight: 38,
                paddingHorizontal: 8,
                paddingVertical: 10,
              }}
              textStyle={{ fontSize: 12 }}
            />
            <Action
              title={copy("common.confirm")}
              onPress={onConfirm}
              disabled={busy}
              style={{
                flex: 1,
                borderRadius: 24,
                minHeight: 38,
                paddingHorizontal: 8,
                paddingVertical: 10,
                backgroundColor: "#dc2626",
              }}
              textStyle={{ fontSize: 12 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
export const s = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  subtitle: { color: colors.text, fontSize: 17, fontWeight: "600" },
  text: { color: colors.text, fontSize: 14, lineHeight: 21 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 24 },
  label: formStyles.label,
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ffffff1a",
    backgroundColor: "#ffffff08",
    padding: 20,
    gap: 14,
  },
  action: {
    minHeight: 44,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  input: formStyles.event,
  divider: {
    borderBottomWidth: 1,
    borderColor: "#ffffff1a",
    paddingBottom: 24,
    marginBottom: 8,
    gap: 18,
  },
  badge: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});
