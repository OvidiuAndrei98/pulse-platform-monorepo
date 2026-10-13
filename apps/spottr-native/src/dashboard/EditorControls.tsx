import { FormInput as TextInput } from '../ui/FormInput';
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Check,
  ChevronDown,
  Minus,
  Plus,
  type LucideIcon,
} from "lucide-react-native";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import { dColors } from "./common";
import {
  DashboardDropdown,
  type DashboardDropdownProps,
} from "./DashboardDropdown";

export function EditorHeading({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={e.heading}>{title}</Text>
      {hint && <Text style={e.hint}>{hint}</Text>}
    </View>
  );
}

export function EditorSelect(props: DashboardDropdownProps) {
  return (
    <DashboardDropdown
      {...props}
      errorInline
      triggerStyle={{
        minHeight: 42,
        borderRadius: 99,
        borderColor: "#ffffff0f",
        backgroundColor: "#ffffff05",
        paddingHorizontal: 16,
      }}
    />
  );
}

export function EditorGrid({
  children,
  columns = 2,
  always = false,
  lastWidth,
  gap = 16,
}: React.PropsWithChildren<{
  columns?: number;
  always?: boolean;
  lastWidth?: number;
  gap?: number;
}>) {
  const wide = useWindowDimensions().width >= 640 || always;
  const items = React.Children.toArray(children);
  return (
    <View
      style={{
        flexDirection: wide ? "row" : "column",
        gap,
        alignItems: "stretch",
      }}
    >
      {items.map((child, index) => (
        <View
          key={index}
          style={
            wide
              ? {
                  flex: lastWidth && index === items.length - 1 ? undefined : 1,
                  width:
                    lastWidth && index === items.length - 1
                      ? lastWidth
                      : undefined,
                  minWidth: 0,
                }
              : { width: "100%" }
          }
        >
          {child}
        </View>
      ))}
    </View>
  );
}

export function EditorChoice({
  label,
  selected,
  onPress,
  disabled,
  testID,
  boxed = true,
  checkbox = false,
  compact = false,
  hint,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  boxed?: boolean;
  checkbox?: boolean;
  compact?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={checkbox ? "checkbox" : "radio"}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          flexDirection: "row",
          gap: compact ? 6 : 12,
          alignItems: "center",
          minHeight: 44,
          opacity: disabled ? 0.5 : 1,
        },
        boxed && {
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: selected ? "#ff004480" : "#ffffff1a",
          backgroundColor: selected ? "#ff00440d" : "transparent",
        },
        style,
      ]}
    >
      <View
        style={{
          height: checkbox && !compact ? 20 : 16,
          width: checkbox && !compact ? 20 : 16,
          borderRadius: checkbox ? 4 : 8,
          borderWidth: 1,
          borderColor: selected ? colors.accent : "#ffffff40",
          backgroundColor: selected ? colors.accent : "#ffffff08",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected &&
          (checkbox ? (
            <Check size={14} color="white" />
          ) : (
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "white",
              }}
            />
          ))}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text
          style={{
            fontSize: compact ? 12 : 14,
            lineHeight: 20,
            color: selected || !boxed ? dColors.text : dColors.muted,
            fontWeight: checkbox ? "500" : "400",
          }}
        >
          {label}
        </Text>
        {hint && <Text style={e.small}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

export function EditorStepper({
  label,
  value,
  onChange,
  min = 0,
  disabled,
  error,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={e.small}>{label}</Text>
      {error && <Text style={e.error}>{error}</Text>}
      <View
        style={{
          height: 42,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          padding: 4,
          borderRadius: 99,
          borderWidth: 1,
          borderColor: "#ffffff0f",
          backgroundColor: "#ffffff05",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} −10`}
          disabled={disabled}
          onPress={() =>
            onChange(Math.max(min, (Number.isFinite(value) ? value : min) - 10))
          }
          style={e.stepperButton}
        >
          <Minus size={14} color={dColors.muted} />
        </Pressable>
        <TextInput variant="bare"
          accessibilityLabel={label}
          keyboardType="decimal-pad"
          editable={!disabled}
          value={Number.isFinite(value) ? String(value) : ""}
          onChangeText={(text) =>
            onChange(Math.max(min, Number(text.replace(",", ".")) || 0))
          }
          style={{
            flex: 1,
            minWidth: 0,
            padding: 0,
            textAlign: "center",
            color: dColors.text,
            fontSize: 14,
            ...Platform.select({ web: { outlineWidth: 0 }, default: {} }),
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} +10`}
          disabled={disabled}
          onPress={() => onChange((Number.isFinite(value) ? value : min) + 10)}
          style={e.stepperButton}
        >
          <Plus size={14} color={dColors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

export const e = StyleSheet.create({
  heading: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.45,
    color: dColors.text,
  },
  hint: { fontSize: 14, lineHeight: 24, color: dColors.muted },
  text: { fontSize: 14, lineHeight: 20, color: dColors.text },
  small: { fontSize: 12, lineHeight: 20, color: dColors.muted },
  error: { fontSize: 12, lineHeight: 18, color: "#f87171" },
  input: {
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#ffffff06",
    borderColor: "#ffffff1a",
    borderWidth: 1,
    fontSize: 14,
    color: dColors.text,
  },
  section: { gap: 24 },
  divider: {
    marginTop: 40,
    paddingTop: 32,
    borderTopWidth: 1,
    borderTopColor: "#ffffff1a",
  },
  ghost: {
    height: 44,
    borderRadius: 99,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  accentSmall: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 99,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ff00441a",
  },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
});
