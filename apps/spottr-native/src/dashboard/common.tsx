import { AccentPressable } from '../ui/AccentPressable';
﻿import React, { useEffect, useRef, useState } from "react";
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
import { useDashboardPolling } from './useDashboardPolling';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  type LucideIcon,
} from "lucide-react-native";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { FormInput, formStyles } from '../ui/FormInput';
import { colors as appColors } from "../ui/theme";
import { DashboardDropdown } from "./DashboardDropdown";
import {ActionButton} from '../ui/ActionButton';
import {PageHeader,Surface} from '../ui/Surface';
import {AppModal} from '../ui/AppModal';
import {Field as SharedField} from '../ui/Field';
import { createDashboardApi } from "./data";
export const dashboardApi = createDashboardApi(accountApi);
// sRGB equivalents of the original dashboard's --foreground and --muted-foreground.
export const dColors = appColors;
const colors = dColors;
export function useDashboardQuery<T>(
  path: string,
  enabled = true,
  interval?: number,
) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["dashboard", user?.id, path],
    enabled: !!user && enabled,
    queryFn: ({ signal }) => accountApi<T>(path, { signal }),
  });
  useDashboardPolling(query.refetch, !!user && enabled, interval);
  return query;
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
export function Heading({title,subtitle}:{title:string;subtitle?:string}) {return <PageHeader title={title} description={subtitle}/>;}
export function Card({children,style,testID}:React.PropsWithChildren<{style?:StyleProp<ViewStyle>;testID?:string}>) {return <Surface testID={testID} style={[{gap:16},style]}>{children}</Surface>;}
export function Action({title,onPress,disabled=false,secondary=false,danger=false,icon:Icon,style,textStyle,testID}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean;danger?:boolean;icon?:LucideIcon;style?:StyleProp<ViewStyle>;textStyle?:StyleProp<TextStyle>;testID?:string}) {
  return <ActionButton testID={testID} tone={danger?'danger':secondary?'secondary':'primary'} icon={Icon?<Icon size={16}/>:undefined} disabled={disabled} onPress={onPress} style={style}><Text style={[{fontSize:14,fontWeight:'600'},textStyle]}>{title}</Text></ActionButton>;
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
    <SharedField label={label} error={error} hideLabel={hideLabel} style={style}>{fieldProps=><FormInput {...fieldProps}

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
    }</SharedField>
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
export function Confirm({title,detail,onConfirm,onClose,busy=false}:{title:string;detail:string;onConfirm:()=>void;onClose:()=>void;busy?:boolean}) {
 const {copy}=usePreferences();
 return <AppModal open title={title} onClose={onClose} dismissible={!busy} footer={<><Action title={copy('common.cancel')} onPress={onClose} disabled={busy} secondary style={{flex:1}}/><Action title={copy('common.confirm')} onPress={onConfirm} disabled={busy} danger style={{flex:1}}/></>}><Text style={{fontSize:14,lineHeight:21,color:colors.muted}}>{detail}</Text></AppModal>;
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
