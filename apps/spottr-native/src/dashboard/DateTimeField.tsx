import { AccentPressable } from '../ui/AccentPressable';
import type { ViewInstance } from 'react-native';
import { FormInput as TextInput } from '../ui/FormInput';
﻿import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import {
  CalendarDays,
  Clock,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import { formatToDatetimeLocal } from "../../../pulse-app/src/features/events/form/dateTimeValues";
import { dColors } from "./common";
import { e } from "./EditorControls";

function usePopover() {
  const [open, setOpen] = useState(false),
    root = useRef<ViewInstance>(null);
  const [anchor, setAnchor] = useState({ x: 20, y: 100 });
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const outside = (event: MouseEvent) => {
      if (
        !(root.current as unknown as HTMLElement)?.contains(
          event.target as Node,
        )
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const toggle = () => {
    root.current?.measureInWindow((x, y, _w, h) =>
      setAnchor({ x, y: y + h + 8 }),
    );
    setOpen(!open);
  };
  return { open, setOpen, root, anchor, toggle };
}

function Popover({
  children,
  label,
  open,
  onClose,
  anchor,
  timeOnly = false,
}: React.PropsWithChildren<{
  label: string;
  open: boolean;
  onClose: () => void;
  anchor: { x: number; y: number };
  timeOnly?: boolean;
}>) {
  const { width, height } = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    desktop = width >= 768;
  const [measuredHeight, setMeasuredHeight] = useState(timeOnly ? 150 : 410);
  if (!open) return null;
  const panelStyle: ViewStyle = {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#171717",
    overflow: "hidden",
    boxShadow: "0 20px 46px rgba(0,0,0,0.5)",
    maxHeight: Math.max(100, height - insets.top - (desktop ? 32 : 128)),
  };
  const content = (
    <ScrollView
      testID={timeOnly ? "editor-time-popover" : "editor-date-popover"}
      accessibilityLabel={label}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: timeOnly ? 16 : 12 }}
    >
      {children}
    </ScrollView>
  );
  if (Platform.OS === "web")
    return (
      <View
        onLayout={(event) => setMeasuredHeight(event.nativeEvent.layout.height)}
        style={[
          panelStyle,
          desktop
            ? {
                position: "absolute",
                ...(anchor.y + measuredHeight > height - 16 &&
                anchor.y > measuredHeight
                  ? { bottom: "100%", marginBottom: 8 }
                  : { top: "100%", marginTop: 8 }),
                left: Math.min(
                  0,
                  width - anchor.x - (timeOnly ? 256 : 296) - 20,
                ),
                width: timeOnly ? 256 : 296,
                zIndex: 40,
              }
            : ({
                position: "fixed",
                left: 20,
                right: 20,
                bottom: 104 + insets.bottom,
                zIndex: 120,
              } as unknown as ViewStyle),
        ]}
      >
        {content}
      </View>
    );
  return (
    <Modal
      transparent
      visible
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityLabel={label}
        onPress={onClose}
        style={{ flex: 1 }}
      >
        <View
          onStartShouldSetResponder={() => true}
          style={[
            panelStyle,
            { position: "absolute" },
            desktop
              ? {
                  width: timeOnly ? 256 : 296,
                  left: Math.max(
                    20,
                    Math.min(anchor.x, width - (timeOnly ? 276 : 316)),
                  ),
                  top: Math.max(
                    insets.top + 8,
                    Math.min(anchor.y, height - measuredHeight - 16),
                  ),
                }
              : { left: 20, right: 20, bottom: 104 + insets.bottom },
          ]}
        >
          {content}
        </View>
      </Pressable>
    </Modal>
  );
}

function TimeStepper({
  value,
  max,
  onChange,
  step = 1,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  const { copy } = usePreferences(),
    [draft, setDraft] = useState(String(value).padStart(2, "0"));
  useEffect(() => setDraft(String(value).padStart(2, "0")), [value]);
  const commit = () => {
    if (!draft) {
      setDraft(String(value).padStart(2, "0"));
      return;
    }
    const next = Math.min(max, Math.max(0, +draft));
    onChange(next);
    setDraft(String(next).padStart(2, "0"));
  };
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        height: 36,
        padding: 4,
        borderRadius: 99,
        borderWidth: 1,
        borderColor: "#ffffff14",
        backgroundColor: "#ffffff08",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy("datePicker.decrease")}
        onPress={() => onChange((value - step + max + 1) % (max + 1))}
        style={{
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Minus size={12} color={dColors.muted} />
      </Pressable>
      <TextInput variant="bare"
        accessibilityLabel={copy("datePicker.enterValue")}
        keyboardType="number-pad"
        selectTextOnFocus
        value={draft}
        onChangeText={(v) => setDraft(v.replace(/\D/g, "").slice(0, 2))}
        onBlur={commit}
        onSubmitEditing={commit}
        style={{
          width: 32,
          color: dColors.text,
          textAlign: "center",
          fontSize: 14,
          fontWeight: "600",
          padding: 0,
          ...Platform.select({ web: { outlineWidth: 0 }, default: {} }),
        }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy("datePicker.increase")}
        onPress={() => onChange((value + step) % (max + 1))}
        style={{
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Plus size={12} color={dColors.muted} />
      </Pressable>
    </View>
  );
}

/** Same compact calendar, immediate local-time edits and Now/Done actions as Next.js. */
export function DateTimeField({
  label,
  value,
  onChange,
  disabled = false,
  error,
  placeholder,
  variant = "event",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  variant?: "event" | "scanner";
}) {
  const { copy, language } = usePreferences(),
    pop = usePopover();
  const parsed = new Date(value),
    selected = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const [month, setMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const locale = language === "ro" ? "ro-RO" : "en-GB";
  const start = new Date(month.getFullYear(), month.getMonth(), 1),
    offset = (start.getDay() + 6) % 7;
  const cells =
    Math.ceil(
      (offset +
        new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) /
        7,
    ) * 7;
  const emit = (date: Date) =>
    onChange(formatToDatetimeLocal(date.toISOString()));
  const time = (hours: number, minutes: number) => {
    const date = new Date(selected);
    date.setHours(hours, minutes, 0, 0);
    emit(date);
  };
  const close = () => pop.setOpen(false);
  return (
    <View ref={pop.root} style={{ gap: 6, zIndex: pop.open ? 50 : 0 }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <Text
          style={[
            e.text,
            variant === "scanner"
              ? { fontSize: 12, fontWeight: "600" }
              : { fontWeight: "500" },
          ]}
        >
          {label}
        </Text>
        {error && <Text style={e.error}>{error}</Text>}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: pop.open, disabled }}
        disabled={disabled}
        onPress={() => {
          setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
          pop.toggle();
        }}
        style={{
          minHeight: variant === "scanner" ? 44 : 42,
          borderRadius: variant === "scanner" ? 8 : 99,
          borderWidth: 1,
          borderColor: variant === "scanner" ? "#ffffff26" : "#ffffff0f",
          backgroundColor: variant === "scanner" ? "#ffffff0d" : "#ffffff05",
          paddingHorizontal: variant === "scanner" ? 12 : 16,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <CalendarDays size={16} color={colors.accent} />
        <Text
          numberOfLines={1}
          style={[
            e.text,
            { flex: 1, color: value ? dColors.text : "#9ca89e66" },
          ]}
        >
          {value
            ? new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(selected)
            : (placeholder ?? copy("datePicker.placeholder"))}
        </Text>
        <Clock size={16} color={dColors.muted} />
      </Pressable>
      <Popover
        label={label}
        open={pop.open}
        onClose={close}
        anchor={pop.anchor}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy("datePicker.previousMonth")}
            onPress={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
            style={{
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronLeft size={16} color={dColors.muted} />
          </Pressable>
          <Text
            style={[e.text, { fontWeight: "600", textTransform: "capitalize" }]}
          >
            {new Intl.DateTimeFormat(locale, {
              month: "long",
              year: "numeric",
            }).format(month)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy("datePicker.nextMonth")}
            onPress={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
            style={{
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ChevronRight size={16} color={dColors.muted} />
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {Array.from({ length: 7 }, (_, i) => (
            <Text
              key={"w" + i}
              style={{
                width: "14.2857%",
                paddingBottom: 2,
                textAlign: "center",
                textTransform: "uppercase",
                color: dColors.muted,
                fontWeight: "600",
                fontSize: 9,
              }}
            >
              {new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
                new Date(2024, 0, i + 1),
              )}
            </Text>
          ))}
          {Array.from({ length: cells }, (_, i) => {
            const day = new Date(
                month.getFullYear(),
                month.getMonth(),
                i - offset + 1,
              ),
              active = day.toDateString() === selected.toDateString(),
              today = day.toDateString() === new Date().toDateString();
            return (
              <View key={i} style={{ width: "14.2857%", padding: 2 }}>
                <AccentPressable fallback={Pressable}
                  accessibilityRole="button"
                  accessibilityLabel={String(day.getDate())}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    day.setHours(
                      selected.getHours(),
                      selected.getMinutes(),
                      0,
                      0,
                    );
                    emit(day);
                  }}
                  style={{
                    height: 32,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor: active ? colors.accent : "transparent",
                    borderWidth: today && !active ? 1 : 0,
                    borderColor: "#ff004480",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: active
                        ? "white"
                        : day.getMonth() === month.getMonth()
                          ? dColors.text
                          : "#9ca89e59",
                      fontWeight: active ? "600" : "400",
                    }}
                  >
                    {day.getDate()}
                  </Text>
                </AccentPressable>
              </View>
            );
          })}
        </View>
        <View
          style={{
            marginTop: 12,
            borderTopWidth: 1,
            borderTopColor: "#ffffff1a",
            paddingTop: 12,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "600",
              color: dColors.muted,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            {copy("datePicker.time")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TimeStepper
              value={selected.getHours()}
              max={23}
              onChange={(hour) => time(hour, selected.getMinutes())}
            />
            <Text style={e.text}>:</Text>
            <TimeStepper
              value={selected.getMinutes()}
              max={59}
              onChange={(minute) => time(selected.getHours(), minute)}
            />
          </View>
        </View>
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => emit(new Date())}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 99,
            }}
          >
            <Text
              style={{ color: colors.accent, fontSize: 12, fontWeight: "500" }}
            >
              {copy("datePicker.now")}
            </Text>
          </Pressable>
          <AccentPressable fallback={Pressable}
            testID="editor-date-done"
            accessibilityRole="button"
            onPress={close}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 99,
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
              {copy("datePicker.done")}
            </Text>
          </AccentPressable>
        </View>
      </Popover>
    </View>
  );
}

export function EditorTimeField({
  value,
  onChange,
  compact,
  disabled,
}: {
  value: string;
  onChange: (time: string) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { copy } = usePreferences(),
    pop = usePopover();
  const [hour = 20, minute = 0] = /^\d{2}:\d{2}$/.test(value)
    ? value.split(":").map(Number)
    : [20, 0];
  const emit = (h: number, m: number) =>
    onChange(String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"));
  return (
    <View ref={pop.root} style={{ zIndex: pop.open ? 50 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy("lineup.time")}
        disabled={disabled}
        onPress={pop.toggle}
        style={[
          e.input,
          { flexDirection: "row", alignItems: "center", gap: 8 },
          compact && {
            minHeight: 32,
            height: 32,
            borderRadius: 6,
            paddingVertical: 4,
            paddingHorizontal: 8,
            width: 112,
          },
        ]}
      >
        <Clock size={compact ? 14 : 16} color={colors.accent} />
        <Text
          style={{
            flex: 1,
            color: value ? dColors.text : dColors.muted,
            fontSize: compact ? 12 : 14,
          }}
        >
          {value || "--:--"}
        </Text>
      </Pressable>
      <Popover
        timeOnly
        label={copy("datePicker.time")}
        open={pop.open}
        onClose={() => pop.setOpen(false)}
        anchor={pop.anchor}
      >
        <Text
          style={{
            color: dColors.muted,
            fontSize: 10,
            fontWeight: "600",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          {copy("datePicker.time")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TimeStepper
            value={hour}
            max={23}
            onChange={(h) => emit(h, minute)}
          />
          <Text style={e.text}>:</Text>
          <TimeStepper
            value={minute}
            max={59}
            step={5}
            onChange={(m) => emit(hour, m)}
          />
        </View>
        <AccentPressable fallback={Pressable}
          accessibilityRole="button"
          onPress={() => pop.setOpen(false)}
          style={{
            marginTop: 16,
            height: 36,
            borderRadius: 99,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "600", fontSize: 12 }}>
            {copy("datePicker.done")}
          </Text>
        </AccentPressable>
      </Popover>
    </View>
  );
}
