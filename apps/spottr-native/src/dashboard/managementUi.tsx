import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Check, type LucideIcon } from "lucide-react-native";
import { Text } from "../ui/Text";
import { dColors as colors } from "./common";

export function Grid({
  children,
  columns = 1,
  sm,
  md,
  lg,
  gap = 12,
  testID,
}: React.PropsWithChildren<{
  columns?: number;
  sm?: number;
  md?: number;
  lg?: number;
  gap?: number;
  testID?: string;
}>) {
  const viewport = useWindowDimensions().width,
    [width, setWidth] = useState(0);
  const count =
    viewport >= 1024 && lg
      ? lg
      : viewport >= 768 && md
        ? md
        : viewport >= 640 && sm
          ? sm
          : columns;
  return (
    <View
      testID={testID}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ flexDirection: "row", flexWrap: "wrap", gap }}
    >
      {React.Children.toArray(children).map((child, index) => (
        <View
          key={React.isValidElement(child) && child.key ? child.key : index}
          style={{
            width: width
              ? Math.max(0, (width - gap * (count - 1)) / count)
              : `${100 / count}%`,
            minWidth: 0,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
export function SmallButton({
  title,
  label,
  onPress,
  icon: Icon,
  disabled,
  danger,
  primary,
  style,
  testID,
}: {
  title?: string;
  label?: string;
  onPress: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const color = danger ? "#fca5a5" : primary ? "#fff" : colors.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label || title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        p.button,
        !title && { width: 36, paddingHorizontal: 0 },
        danger && { borderColor: "#f8717140", backgroundColor: "#ef444414" },
        primary && {
          backgroundColor: colors.accent,
          borderColor: colors.accent,
        },
        style,
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {Icon && <Icon size={16} color={color} />}
      {title && (
        <Text
          style={{
            fontSize: 12,
            fontWeight: "600",
            color,
            textAlign: "center",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function SectionTitle({
  title,
  subtitle,
  icon: Icon,
  warning,
  right,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  warning?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <View style={[p.row, { alignItems: "flex-start", gap: 12 }]}>
      {Icon && (
        <View
          style={[
            p.iconBox,
            warning && {
              backgroundColor: "#fbbf2414",
              borderColor: "#fcd34d33",
            },
          ]}
        >
          <Icon size={18} color={warning ? "#fcd34d" : colors.accent} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={p.sectionTitle}>{title}</Text>
        {subtitle && <Text style={p.muted}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}
export function Status({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "green" | "red" | "amber" | "accent" | "blue";
}) {
  const color = {
    muted: colors.muted,
    green: "#6ee7b7",
    red: "#fca5a5",
    amber: "#fcd34d",
    accent: colors.accent,
    blue: "#bae6fd",
  }[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: tone === "muted" ? "#ffffff14" : color + "1a",
      }}
    >
      <Text
        style={{
          color,
          fontSize: 10,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
export function CheckRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  plain,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  plain?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={[
        p.panel,
        p.row,
        { padding: 14, borderRadius: 12, alignItems: "flex-start" },
        plain && {
          borderWidth: 0,
          padding: 0,
          backgroundColor: "transparent",
          flexDirection: "row-reverse",
          gap: 12,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={p.label}>{label}</Text>
        {hint && <Text style={p.tiny}>{hint}</Text>}
      </View>
      <View
        style={{
          width: 16,
          height: 16,
          marginTop: 2,
          borderRadius: 3,
          borderWidth: 1,
          borderColor: checked ? colors.accent : "#ffffff55",
          backgroundColor: checked ? colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check size={12} color="white" />}
      </View>
    </Pressable>
  );
}
export const p = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
  },
  label: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  tiny: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  panel: {
    borderWidth: 1,
    borderColor: "#ffffff1a",
    backgroundColor: "#ffffff06",
    borderRadius: 16,
    padding: 16,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: "#ffffff1a",
    paddingTop: 24,
    gap: 16,
  },
  line: { borderTopWidth: 1, borderTopColor: "#ffffff1a" },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ff004440",
    backgroundColor: "#ff00441a",
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ffffff26",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  empty: {
    borderWidth: 1,
    borderColor: "#ffffff26",
    borderStyle: "dashed",
    padding: 24,
  },
  warning: {
    backgroundColor: "#fbbf2414",
    borderWidth: 1,
    borderColor: "#fbbf2440",
    padding: 12,
    color: "#fef3c7",
    fontSize: 12,
    lineHeight: 20,
  },
});
