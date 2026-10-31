import { AccentPressable } from '../ui/AccentPressable';
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { MotionPressable as Pressable } from "../ui/MotionPressable";
import { BottomSheetView } from "@gorhom/bottom-sheet";
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import QRCode from "react-native-qrcode-svg";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MapPin,
  Zap,
  CheckCircle2,
  Clock3,
} from "lucide-react-native";
import { AppSheet } from "../ui/AppSheet";
import { Text } from "../ui/Text";
import { Wordmark } from "../ui/Logo";
import { useOpenLink } from "../ui/common";
import { colors } from "../ui/theme";
import { usePreferences } from "../usePreferences";
import { useTicketBrightness } from "./useTicketBrightness";
import { exportTicket } from "./exportTicket";
import { formatTicketDate } from "../../../pulse-app/src/components/tickets/ticketDesign";
import { ticketStatus, type UserTicket } from "../data/tickets";
import { useAuth } from "../auth/AuthProvider";
import { TicketAvailability } from './TicketAvailability';
import { initialGroupTicket } from './ticketGroups';
import { useEventClock } from '../data/useEventClock';
import {ActionButton as UIActionButton} from '../ui/ActionButton';
export { ticketStatus, type UserTicket } from "../data/tickets";

export function TicketSheet({
  tickets,
  initialId,
  onClose,
  offline = false,
  savedAt,
  preferUnused = true,
}: {
  tickets: UserTicket[];
  initialId: string;
  onClose: () => void;
  offline?: boolean;
  savedAt?: number;
  preferUnused?: boolean;
}) {
  const { controller } = useAuth();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { copy, language } = usePreferences(),
    brightness = useTicketBrightness(),
    link = useOpenLink();
  const [id, setId] = useState(() => initialGroupTicket(tickets, initialId, preferUnused)),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const qr = useRef<{
      toDataURL: (callback: (value: string) => void) => void;
    } | null>(null),
    pending = useRef(false);
  const [area, setArea] = useState({ width: 320, height: 480 }),
    [cardHeight, setCardHeight] = useState(480);
  const now = useEventClock();
  const opacity = useSharedValue(1);
  const cardMotion = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const moveTicket = (direction: number) => {
    if (pending.current) return;
    setId(current => {
      const position = tickets.findIndex(item => item.id === current);
      return tickets[position + direction]?.id ?? current;
    });
  };
  useEffect(() => {
    opacity.value = 0.65;
    opacity.value = withTiming(1, { duration: 180 });
  }, [id, opacity]);
  const swipe = Gesture.Pan().enabled(tickets.length > 1 && !busy)
    .activeOffsetX([-20, 20]).failOffsetY([-12, 12]).runOnJS(true)
    .onEnd(({ translationX }) => {
      if (Math.abs(translationX) >= 45) moveTicket(translationX < 0 ? 1 : -1);
    });
  const ticket = tickets.find((item) => item.id === id) ?? tickets[0];
  if (!ticket) return null;
  const index = tickets.indexOf(ticket);
  const status = ticketStatus(ticket, now),
    qrSize = Math.max(100, Math.min(230, area.width - 76, area.height - 280));
  const scale = Math.min(1, Math.max(0.1, (area.height - 2) / cardHeight));
  const download = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    const token = controller.getToken();
    try {
      const data =
        Platform.OS === "web"
          ? ""
          : await new Promise<string>((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error("QR export timed out")),
                5000,
              );
              if (!qr.current) {
                clearTimeout(timeout);
                reject(new Error("QR not ready"));
                return;
              }
              qr.current.toDataURL((value) => {
                clearTimeout(timeout);
                resolve("data:image/png;base64," + value);
              });
            });
      if (!alive.current || controller.getToken() !== token) return;
      await exportTicket(
        ticket,
        data,
        copy,
        language,
        () => alive.current && controller.getToken() === token,
      );
    } catch {
      if (alive.current) setFailed(true);
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return (
    <AppSheet
      open
      horizontalContent
      onClose={onClose}
      label={copy("common.close")}
      testID="ticket-preview"
    >
      <BottomSheetView
        style={{
          height: "100%",
          paddingHorizontal: 18,
          paddingBottom: 28,
          gap: 12,
        }}
      >
        <View>
          <Text style={s.eyebrow}>
            {copy("tickets.yourEntrance").toUpperCase()}
          </Text>
          <Text style={s.heading}>{copy("tickets.showAtDoor")}</Text>
          <TicketAvailability offline={offline} savedAt={savedAt} />
        </View>
        {tickets.length > 1 && (
          <View testID="ticket-paging" style={s.paging}>
            <Pressable
              disabled={index <= 0 || busy}
              onPress={() => moveTicket(-1)}
              accessibilityRole="button"
              accessibilityLabel={copy("tickets.previousTicket")}
              style={[s.arrow, index <= 0 && { opacity: 0.25 }]}
            >
              <ChevronLeft color="white" size={20} />
            </Pressable>
            <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>
              {copy("tickets.ticketPosition", {
                current: index + 1,
                total: tickets.length,
              })}
            </Text>
            <Pressable
              disabled={index === tickets.length - 1 || busy}
              onPress={() => moveTicket(1)}
              accessibilityRole="button"
              accessibilityLabel={copy("tickets.nextTicket")}
              style={[
                s.arrow,
                index === tickets.length - 1 && { opacity: 0.25 },
              ]}
            >
              <ChevronRight color="white" size={20} />
            </Pressable>
          </View>
        )}
        <GestureDetector gesture={swipe} touchAction="pan-y">
        <View collapsable={false}
          testID="ticket-fit-area"
          onLayout={(e) => setArea(e.nativeEvent.layout)}
          style={{
            flex: 1,
            minHeight: 0,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <Animated.View
            onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
            style={[
              s.pass,
              cardMotion,
              { width: Math.min(440, area.width - 2), transform: [{ scale }] },
            ]}
          >
            <Wordmark />
            <View testID="ticket-admission-status" accessibilityLiveRegion="polite" style={[s.statusBadge, status === 'active' && s.validBadge]}>
              {status === 'expired' ? <Clock3 size={13} color="#b5adb1" /> : <CheckCircle2 size={13} color={status === 'active' ? '#6ee7b7' : '#b5adb1'} />}
              <Text style={[s.statusText, status === 'active' && { color: '#6ee7b7' }]}>
                {copy(status === 'active' ? 'tickets.validForEntry' : status === 'used' ? 'tickets.used' : 'tickets.expired')}
              </Text>
            </View>
            <Text style={s.type}>{ticket.ticketTypeName.toUpperCase()}</Text>
            <Text style={s.title}>{ticket.eventTitle.toUpperCase()}</Text>
            <Text style={s.date}>
              {formatTicketDate(ticket.startTime, copy("date.unknown"))}
            </Text>
            <View style={s.tear}>
              <View style={[s.notch, { left: -10 }]} />
              <View style={[s.notch, { right: -10 }]} />
            </View>
            <View style={{ alignItems: "center", gap: 12 }}>
              <Text style={s.label}>
                {copy("ticketPdf.ticketCode").toUpperCase()}
              </Text>
              <View style={s.qr}>
                <QRCode
                  key={ticket.validationHash}
                  value={ticket.validationHash}
                  ecl="M"
                  size={qrSize}
                  quietZone={12}
                  getRef={(value) => {
                    qr.current = value;
                  }}
                />
              </View>
              <Text style={s.code}>{ticket.id}</Text>
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                void link.open(
                  "https://maps.google.com/?q=" +
                    encodeURIComponent(ticket.locationName),
                )
              }
              style={{
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 18,
              }}
            >
              <MapPin size={14} color={colors.accent} />
              <Text style={s.location}>{ticket.locationName}</Text>
            </Pressable>
            <Text style={s.hint}>{copy(status === 'active' ? 'ticketPdf.validationHint' : status === 'used' ? 'tickets.alreadyUsed' : 'tickets.eventEnded')}</Text>
          </Animated.View>
        </View>
        </GestureDetector>
        {brightness && (
          <View
            style={{ flexDirection: "row", justifyContent: "center", gap: 7 }}
          >
            <Zap size={13} color={colors.accent} />
            <Text style={{ fontSize: 10, color: "#999195" }}>
              {copy("tickets.autoBrightness")}
            </Text>
          </View>
        )}
        {(failed || link.error) && (
          <Text
            accessibilityRole="alert"
            style={{ color: "#f87171", fontSize: 12 }}
          >
            {copy("feedback.actionFailed")}
          </Text>
        )}
        <UIActionButton
          testID="ticket-download"
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void download()}
          style={[s.download, busy && { opacity: 0.5 }]}
        >
          <Download size={16} color="white" />
          <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>
            {copy("ticketPdf.downloadPdf")}
          </Text>
        </UIActionButton>
      </BottomSheetView>
    </AppSheet>
  );
}
const s = StyleSheet.create({
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    color: colors.accent,
  },
  heading: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: "white",
    marginTop: 5,
  },
  pass: {
    padding: 18,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "#ff004447",
    backgroundColor: "#140f12",
  },
  type: {
    marginTop: 12,
    color: colors.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 4,
    color: "white",
    fontSize: 24,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  date: { marginTop: 8, color: "#bab4b7", fontSize: 12 },
  tear: {
    marginVertical: 16,
    marginHorizontal: -18,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#49313a",
  },
  notch: {
    position: "absolute",
    top: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#000",
  },
  label: {
    color: "#d8d1d4",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.6,
  },
  qr: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 6,
    overflow: "hidden",
  },
  code: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  location: {
    fontSize: 12,
    color: "#bab4b7",
    flexShrink: 1,
    textAlign: "center",
  },
  hint: {
    marginTop: 12,
    textAlign: "center",
    color: "#999195",
    fontSize: 10,
    lineHeight: 15,
  },
  statusBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 5, marginTop: 12, borderRadius: 99, backgroundColor: '#ffffff0d' },
  validBadge: { backgroundColor: '#10b98114' },
  statusText: { color: '#b5adb1', fontSize: 11, fontWeight: '600', flexShrink: 1 },
  paging: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  arrow: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: "#ffffff0d",
    borderWidth: 1,
    borderColor: "#ffffff1a",
    alignItems: "center",
    justifyContent: "center",
  },
  download: {
    height: 44,
    borderRadius: 99,
    backgroundColor: colors.accent,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
