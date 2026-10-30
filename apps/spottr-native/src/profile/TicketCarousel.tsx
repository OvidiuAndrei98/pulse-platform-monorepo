import type { FlatList as FlatListInstance } from 'react-native';
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  QrCode,
  Ticket,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { usePreferences } from "../PreferencesProvider";
import { formatDate } from "../data/events";
import type { UserTicket } from "../data/tickets";
import { Logo } from "../ui/Logo";
import { MotionPressable as Pressable } from "../ui/MotionPressable";
import { Text } from "../ui/Text";
import { colors, screenPadding } from "../ui/theme";
import type { ProfileTicketTab, TicketGroup } from "./ticketGroups";

const GAP = 16;
const TicketGap = () => <View style={{ width: GAP }} />;

export const TicketCarousel = React.memo(function TicketCarousel({
  groups,
  tab,
  now,
  onOpen,
}: {
  groups: TicketGroup[];
  tab: ProfileTicketTab;
  now: number;
  onOpen(ticket: UserTicket): void;
}) {
  const { copy } = usePreferences();
  const { width: viewportWidth } = useWindowDimensions();
  const list = useRef<FlatListInstance>(null),
    offset = useRef(0);
  const [width, setWidth] = useState(0),
    [edges, setEdges] = useState({ start: true, end: false });
  // A glimpse of the next ticket makes the horizontal interaction visible on phones.
  const cardWidth = Math.min(
    340,
    Math.max(1, width - screenPadding * 2 - (groups.length > 1 ? 28 : 0)),
  );
  const step = cardWidth + GAP;
  const maxOffset = Math.max(
    0,
    groups.length * step - GAP + screenPadding * 2 - width,
  );
  const position = (x: number) => {
    offset.current = Math.max(0, Math.min(maxOffset, x));
    const next = {
      start: offset.current < 2,
      end: offset.current >= maxOffset - 2,
    };
    setEdges((old) =>
      old.start === next.start && old.end === next.end ? old : next,
    );
  };
  useEffect(() => {
    const x = Math.min(offset.current, maxOffset);
    list.current?.scrollToOffset({ offset: x, animated: false });
    position(x);
  }, [width, maxOffset]);
  const scroll = (direction: number) => {
    const x = Math.max(
      0,
      Math.min(maxOffset, offset.current + direction * step),
    );
    list.current?.scrollToOffset({ offset: x, animated: true });
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    position(event.nativeEvent.contentOffset.x);
  return (
    <View
      testID="profile-ticket-carousel"
      style={s.rail}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {viewportWidth >= 768 && maxOffset > 1 && (
        <View style={s.controls}>
          {([-1, 1] as const).map((direction) => {
            const disabled = direction < 0 ? edges.start : edges.end,
              Icon = direction < 0 ? ChevronLeft : ChevronRight;
            return (
              <Pressable
                key={direction}
                testID={
                  direction < 0 ? "profile-ticket-prev" : "profile-ticket-next"
                }
                accessibilityRole="button"
                accessibilityLabel={copy(
                  direction < 0
                    ? "tickets.previousEvent"
                    : "tickets.nextEventInList",
                )}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => scroll(direction)}
                style={({ pressed }) => [
                  s.arrow,
                  { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
                ]}
              >
                <Icon size={18} color={colors.text} />
              </Pressable>
            );
          })}
        </View>
      )}
      {width > 0 && (
        <FlatList
          ref={list}
          testID="profile-ticket-rail"
          horizontal
          data={groups}
          keyExtractor={(group) => group.eventId}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.railContent}
          ItemSeparatorComponent={TicketGap}
          snapToInterval={step}
          snapToAlignment="start"
          decelerationRate="fast"
          directionalLockEnabled
          onScroll={onScroll}
          scrollEventThrottle={32}
          initialNumToRender={4}
          windowSize={3}
          renderItem={({ item, index }) => (
            <TicketCard
              group={item}
              width={cardWidth}
              tab={tab}
              featured={index === 0}
              now={now}
              onOpen={onOpen}
            />
          )}
        />
      )}
    </View>
  );
});

function TicketCard({
  group,
  width,
  tab,
  featured,
  now,
  onOpen,
}: {
  group: TicketGroup;
  width: number;
  tab: ProfileTicketTab;
  featured: boolean;
  now: number;
  onOpen(ticket: UserTicket): void;
}) {
  const { copy, language } = usePreferences();
  const ticket = group.tickets[0]!,
    active = tab === "active";
  const locale = language === "ro" ? "ro-RO" : "en-GB",
    start = new Date(ticket.startTime);
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Bucharest",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).formatToParts(start);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    date.find((item) => item.type === type)?.value ?? "";
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Bucharest",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(start);
  const count = copy("userProfile.ticketCount", {
    count: group.tickets.length,
  });
  const status = active
    ? Date.parse(ticket.startTime) <= now
      ? "tickets.happeningNow"
      : featured
        ? "tickets.nextEvent"
        : "tickets.upcoming"
    : "tickets.history";
  return (
    <Pressable
      testID={"profile-ticket-" + group.eventId}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.eventTitle}. ${formatDate(ticket.startTime, language, true, { year: true })}. ${count}. ${copy(active ? "tickets.showQr" : "tickets.viewTicket")}`}
      onPress={() => onOpen(ticket)}
      style={[s.card, { width }]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={
          active
            ? ["#21121a", "#131113", "#101012"]
            : ["#19191c", "#111113", "#101012"]
        }
        style={StyleSheet.absoluteFill}
      />
      <View style={s.body}>
        <View style={s.brandRow}>
          <Logo size={24} />
          <View style={[s.badge, active && s.activeBadge]}>
            <Text
              numberOfLines={1}
              style={[s.badgeText, active && { color: colors.accent }]}
            >
              {copy(status).toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={s.eventRow}>
          <View style={s.date}>
            <Text style={s.day}>{part("day")}</Text>
            <Text style={s.month}>
              {part("month").replace(".", "").toUpperCase()}
            </Text>
            <Text style={s.year}>{part("year")}</Text>
          </View>
          <View style={s.event}>
            <Text numberOfLines={2} style={s.title}>
              {ticket.eventTitle}
            </Text>
            <View style={s.location}>
              <MapPin size={14} color={active ? colors.accent : colors.muted} />
              <Text numberOfLines={1} style={s.locationText}>
                {ticket.locationName}
              </Text>
            </View>
            <Text style={s.time}>{time}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={s.types}>
          {[...new Set(group.tickets.map((item) => item.ticketTypeName))].join(
            " · ",
          )}
        </Text>
      </View>
      <View pointerEvents="none" style={s.perforation}>
        <View style={s.dashes} />
        <View style={[s.cutout, { left: -9 }]} />
        <View style={[s.cutout, { right: -9 }]} />
      </View>
      <View style={s.footer}>
        <View style={s.count}>
          <Ticket size={14} color={colors.muted} />
          <Text numberOfLines={1} style={s.countText}>
            {count}
          </Text>
        </View>
        <View style={[s.action, active && { backgroundColor: colors.accent }]}>
          <QrCode size={16} color={colors.text} />
          <Text style={s.actionText}>
            {copy(active ? "tickets.showQr" : "tickets.viewTicket")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  rail: { marginHorizontal: -screenPadding },
  railContent: {
    paddingHorizontal: screenPadding,
    paddingVertical: 4,
    alignItems: "stretch",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: screenPadding,
    marginBottom: 8,
  },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#151517",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  body: { padding: 18, gap: 12 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  badge: {
    maxWidth: "84%",
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#ffffff08",
    borderRadius: 99,
  },
  activeBadge: { backgroundColor: "#ff004412" },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: colors.muted,
  },
  // Keep the perforation aligned across cards with one- and two-line titles.
  eventRow: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 96 },
  date: {
    minWidth: 53,
    alignItems: "center",
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: "#ffffff18",
  },
  day: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "800",
    lineHeight: 40,
    letterSpacing: -1.4,
  },
  month: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.3,
    marginTop: 2,
  },
  year: { color: colors.muted, fontSize: 10, marginTop: 4 },
  event: { flex: 1, minWidth: 0, gap: 6 },
  title: {
    color: colors.text,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  time: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  location: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { color: "#b5b5be", fontSize: 12, lineHeight: 16, flex: 1 },
  types: { color: colors.muted, fontSize: 11 },
  perforation: { height: 1, justifyContent: "center" },
  dashes: {
    marginHorizontal: 18,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: "#ffffff20",
  },
  cutout: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.bg,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: 16,
  },
  count: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  countText: { color: colors.text, fontSize: 12, flexShrink: 1 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 99,
    backgroundColor: "#ffffff0d",
  },
  actionText: { color: colors.text, fontSize: 12, fontWeight: "600" },
});
