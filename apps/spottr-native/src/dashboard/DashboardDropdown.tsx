import type { ViewInstance, ScrollViewInstance } from 'react-native';
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Check, ChevronDown, type LucideIcon } from "lucide-react-native";
import { Text } from "../ui/Text";
import { usePreferences } from "../usePreferences";
import {colors} from "../ui/theme";
import { dropdownPlacement, type DropdownAnchor } from "./dropdownPlacement";

export type DashboardDropdownProps = {
  label: string;
  value: string;
  onChange(value: string): void;
  options: { value: string; label: string }[];
  placeholder: string;
  icon?: LucideIcon;
  disabled?: boolean;
  error?: string;
  testID?: string;
  triggerStyle?: StyleProp<ViewStyle>;
  errorInline?: boolean;
  hideLabel?: boolean;
  variant?: 'default' | 'billing';
};

export function DashboardDropdown({
  label,
  value,
  onChange,
  options,
  placeholder,
  icon: Icon,
  disabled,
  error,
  testID,
  triggerStyle,
  errorInline = false,
  hideLabel = false,
  variant = 'default',
}: DashboardDropdownProps) {
  const { copy } = usePreferences();
  const trigger = useRef<ViewInstance>(null),
    menu = useRef<ScrollViewInstance>(null),
    viewport = useWindowDimensions();
  const [anchor, setAnchor] = useState<DropdownAnchor | null>(null),
    [active, setActive] = useState(0);
  const [focusVisible, setFocusVisible] = useState(false);
  const close = () => {
    setAnchor(null);
    if (Platform.OS === "web")
      (trigger.current as unknown as HTMLElement)?.focus?.();
  };
  const select = (index: number) => {
    const option = options[index];
    if (option && !disabled) onChange(option.value);
    close();
  };
  const open = () => {
    if (disabled) return;
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    trigger.current?.measureInWindow((x, y, width, height) => {
      if (width > 0) setAnchor({ x, y, width, height });
    });
  };
  // A popup never survives a resize or a change that disables its field.
  useEffect(() => {
    setAnchor(null);
  }, [viewport.width, viewport.height, disabled]);
  useEffect(() => {
    if (!anchor || Platform.OS !== "web") return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) =>
          Math.max(
            0,
            Math.min(
              options.length - 1,
              index + (event.key === "ArrowDown" ? 1 : -1),
            ),
          ),
        );
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select(active);
      }
      if (event.key === "Tab") close();
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [anchor, active, options, disabled]);
  useEffect(() => {
    if (anchor)
      menu.current?.scrollTo({
        y: Math.max(0, (active - 2) * 40),
        animated: false,
      });
  }, [active, anchor]);
  const placement =
    anchor &&
    dropdownPlacement(
      anchor,
      viewport,
      Math.min(240, Math.max(52, options.length * 40 + 12)),
    );
  return (
    <View style={{ gap: 6 }}>
      {!hideLabel && <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: "500", color: "#f7faf2" }}>
          {label}
        </Text>
        {errorInline && error && (
          <Text style={{ fontSize: 12, color: "#ef4444" }}>{error}</Text>
        )}
      </View>}
      <Pressable
        ref={trigger}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, expanded: !!anchor }}
        aria-expanded={!!anchor}
        aria-invalid={!!error}
        disabled={disabled}
        onPress={open}
        onFocus={event => setFocusVisible(Platform.OS === 'web' && !!(event.currentTarget as unknown as HTMLElement).matches?.(':focus-visible'))}
        onBlur={() => setFocusVisible(false)}
        style={[
          {
            minHeight: 44,
            borderWidth: 1,
            borderColor: error ? colors.danger : colors.inputBorder,
            borderRadius: 12,
            backgroundColor: colors.surface,
            paddingHorizontal: 13,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            opacity: disabled ? 0.5 : 1,
          },
          triggerStyle,
          Platform.OS === 'web' && {outlineStyle:'solid',outlineWidth:focusVisible?2:0,outlineColor:colors.focus,outlineOffset:2},
          !!anchor && { borderColor: '#ff004499' },
          !!error && { borderColor: '#f87171b3' },
        ]}
      >
        {Icon && <Icon size={16} color="#ff0044" />}
        <Text
          numberOfLines={1}
          style={{
            fontSize: variant === 'billing' && viewport.width < 640 ? 16 : 14,
            color: options.some((o) => o.value === value)
              ? "#f7faf2"
              : "#9ca89e80",
            flex: 1,
          }}
        >
          {options.find((option) => option.value === value)?.label ||
            placeholder}
        </Text>
        <ChevronDown
          size={16}
          color="#9ca89e"
          style={{ transform: [{ rotate: anchor ? "180deg" : "0deg" }] }}
        />
      </Pressable>
      {!errorInline && error && (
        <Text accessibilityRole="alert" style={{ fontSize: 12, color: "#f87171" }}>{error}</Text>
      )}
      {anchor && placement && (
        <Modal
          transparent
          animationType="none"
          onRequestClose={close}
          statusBarTranslucent
        >
          <View style={{ flex: 1 }}>
            <Pressable
              accessibilityLabel={copy("common.close")}
              onPress={close}
              style={{ position: "absolute", inset: 0 }}
            />
            <ScrollView
              ref={menu}
              testID={
                testID ? `${testID}-options` : "dashboard-dropdown-options"
              }
              accessibilityRole="list"
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={{
                position: "absolute",
                ...placement,
                borderWidth: 1,
                borderColor: "#ffffff26",
                borderRadius: 16,
                backgroundColor: "#171717",
                boxShadow: "0 18px 38px rgba(0,0,0,0.45)",
              }}
              contentContainerStyle={{ padding: 6 }}
            >
              {options.map((option, index) => (
                <Pressable
                  key={option.value}
                  testID={
                    testID ? `${testID}-option-${option.value}` : undefined
                  }
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected: option.value === value }}
                  aria-selected={option.value === value}
                  onPress={() => select(index)}
                  onFocus={() => setActive(index)}
                  onHoverIn={() => setActive(index)}
                  style={{
                    minHeight: 40,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    borderWidth:1,
                    borderColor:index === active ? colors.focus : 'transparent',
                    ...(Platform.OS === 'web' ? {outlineStyle:'solid' as const,outlineWidth:0} : {}),
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor:
                      option.value === value
                        ? "#ff004426"
                        : index === active
                          ? "#ffffff0d"
                          : "transparent",
                  }}
                >
                  {Icon && (
                    <Icon
                      size={14}
                      color={option.value === value ? "#ff0044" : "#f7faf2"}
                    />
                  )}
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: "#f7faf2",
                    }}
                  >
                    {option.label}
                  </Text>
                  {option.value === value && (
                    <Check size={16} color="#ff0044" />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}
