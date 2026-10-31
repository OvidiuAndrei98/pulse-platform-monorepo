import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { CheckCircle2, MapPin } from "lucide-react-native";
import Animated from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Event, formatDate, isLive } from "../data/events";
import { usePreferences } from "../usePreferences";
import { colors } from "./theme";
import { EventImage } from "./common";
import { PromotionArtwork } from "./PromotionArtwork";
import { Text } from "./Text";
import { EventFriendsPreview } from '../social/EventFriendsPreview';
import { MotionPressable, usePressMotion } from './MotionPressable';
import { AnimatedBookmark } from './AnimatedBookmark';

export function EventCard({
  event,
  onOpen,
  wide = false,
  promoted = false,
}: {
  event: Event;
  onOpen: () => void;
  wide?: boolean;
  promoted?: boolean;
}) {
  const { language, copy, saved, toggleSaved, ready } = usePreferences();
  const motion = usePressMotion();
  const bookmarked = saved.some((e) => e.id === event.id),
    live = isLive(event);
  const time = live
    ? new Intl.DateTimeFormat(language, {
        timeZone: "Europe/Bucharest",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(event.startTime))
    : formatDate(event.startTime, language);
  return (
    <Animated.View
      testID={'event-card-' + event.id}
      style={[s.card, wide && { width: "100%" }, motion.style]}
    >
      <LinearGradient pointerEvents="none" colors={["#141414", "#090909", "#0c0c0c"]} style={[StyleSheet.absoluteFill, { borderRadius: 26 }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={event.title}
        onPress={onOpen}
        onPressIn={motion.pressIn}
        onPressOut={motion.pressOut}
      >
        <View style={s.imageWrap}>
          <EventImage uri={event.bannerUrl} style={StyleSheet.absoluteFill} />
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: "#00000033" }]}
          />
          <LinearGradient
            colors={["transparent", "#00000033", "#000000bf"]}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.badges}>
            <View style={{ gap: 4 }}>
            {promoted && <Text style={[s.live, { color: colors.accent, borderColor: '#ff004466', backgroundColor: '#ff00441a' }]}>{copy('promotions.sponsored').toUpperCase()}</Text>}
            {live ? (
              <Text style={s.live}>
                ● {copy("common.liveNow").toUpperCase()}
              </Text>
            ) : (
              <View />
            )}
            </View>
            <Text style={s.date}>{time}</Text>
          </View>
          {event.organizerAbsorbsServiceFee && (
            <View style={s.tax}>
              <CheckCircle2 size={12} color={colors.accent} />
              <Text style={{ fontSize: 10, color: colors.accent }}>
                {copy("events.finalPrice")}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
      <View style={s.body}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            onPress={onOpen}
            onPressIn={motion.pressIn}
            onPressOut={motion.pressOut}
            style={{ flex: 1 }}
          >
            <Text numberOfLines={1} style={s.title}>
              {event.title.toLowerCase()}
            </Text>
          </Pressable>
          <MotionPressable
            testID={'event-bookmark-' + event.id}
            accessibilityRole="button"
            accessibilityLabel={copy(
              bookmarked
                ? "eventSheet.removeFavorite"
                : "eventSheet.addFavorite",
            )}
            accessibilityState={{ selected: bookmarked, disabled: !ready }}
            disabled={!ready}
            onPress={() => toggleSaved(event)}
            hitSlop={10}
            style={s.save}
          >
            <AnimatedBookmark selected={bookmarked} />
          </MotionPressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={event.title}
          onPress={onOpen}
          onPressIn={motion.pressIn}
          onPressOut={motion.pressOut}
          style={{ gap: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text style={s.category}>
            {event.category || copy("events.generalCategory")}
          </Text><EventFriendsPreview eventId={event.id}/></View>
          <View style={s.location}>
            <MapPin size={14} color="#a1a1aa" />
            <Text numberOfLines={1} style={s.locationText}>
              {event.locationName || copy("events.locationUnknown")}
            </Text>
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}
export function HeroCard({
  event,
}: {
  event: Event;
}) {
  const { language } = usePreferences();
  return (
    <View pointerEvents="none" style={s.hero}>
      <PromotionArtwork uri={event.bannerUrl} />
      <LinearGradient
        colors={["#00000033", "#00000026", "#000000ff"]}
        style={StyleSheet.absoluteFill}
      />
      <Text style={[s.date, s.heroDate]}>
        {formatDate(event.startTime, language, true)}
      </Text>
      <View style={s.heroBody}>
        <Text style={s.heroCategory}>{event.category}</Text>
        <Text style={s.heroTitle} numberOfLines={2}>
          {event.title}
        </Text>
        <View style={[s.location, { marginTop: 4 }]}>
          <MapPin size={16} color={colors.accent} />
          <Text numberOfLines={1} style={s.heroLocation}>
            {[event.locationName, event.city].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  card: { width: 220, borderRadius: 26, padding: 8 },
  imageWrap: {
    aspectRatio: 4 / 3,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#0a0a0a",
  },
  badges: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 4,
  },
  live: {
    backgroundColor: "#00000099",
    color: "#f87171",
    borderRadius: 99,
    height: 24,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: "600",
    borderWidth: 1,
    borderColor: "#ef44444d",
  },
  date: {
    backgroundColor: "#00000099",
    color: colors.text,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 10,
    fontWeight: "600",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ffffff1a",
  },
  tax: {
    position: "absolute",
    bottom: 10,
    left: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#ff004459",
    backgroundColor: "#000000a6",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  body: { padding: 4, gap: 8, marginTop: 4 },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.4,
    textTransform: "capitalize",
  },
  save: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  category: {
    alignSelf: "flex-start",
    height: 24,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#ffffff1a",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#ffffff0d",
    color: "#d4d4d8",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  location: { flexDirection: "row", alignItems: "center", gap: 6 },
  locationText: { color: "#d4d4d8cc", fontSize: 12, flex: 1 },
  hero: {
    aspectRatio: 4 / 3,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "#101014",
  },
  heroDate: {
    position: "absolute",
    right: 16,
    top: 16,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroBody: { position: "absolute", bottom: 16, left: 16, right: 16, gap: 8 },
  heroCategory: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1.98,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 24.48,
    letterSpacing: -0.84,
  },
  heroLocation: { color: "#ffffffbf", fontSize: 14, flex: 1 },
});
