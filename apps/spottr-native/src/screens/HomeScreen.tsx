import type { ScrollView as ScrollViewInstance } from 'react-native';
import { GlassPressable } from '../ui/GlassPressable';
import { GlassButtonGroup } from '../ui/GlassButtonGroup';
import { ActionIcon } from '../ui/ActionIcon';
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Search } from "lucide-react-native";
import { useNavigation, useScrollToTop } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import * as Location from "expo-location";
import { usePreferences } from "../PreferencesProvider";
import { eventsApi } from "../data/api";
import { useAuth } from "../auth/AuthProvider";
import { NotificationsPopover } from "../notifications/NotificationsPopover";
import { useEventClock } from "../data/useEventClock";
import { manualRefreshOptions, seedEvent, useHomeEvents } from "../data/queries";
import { RefreshScrollView } from "../ui/RefreshScrollView";
import { WardrobeCard } from "../wardrobe/WardrobeScreen";
import { isLive, type Event } from "../data/events";
import { EventCard } from "../ui/EventCard";
import { PromotionHero } from "../ui/PromotionHero";
import { MotionPressable as Pressable } from "../ui/MotionPressable";
import { Feedback } from "../ui/common";
import { HomeLoading } from '../ui/HomeLoading';
import { Text } from "../ui/Text";
import { Logo } from "../ui/Logo";
import { colors } from "../ui/theme";
import type { RootParamList } from "../navigation/types";
import { mixFeedPromotions } from '../../../pulse-app/src/features/events/promotions';
import { VisiblePromotion, trackPromotion } from '../ui/VisiblePromotion';
import { useNavbarScroll } from '../navigation/useNavbarScroll';

const guests = [
  "Party Crasher",
  "Night Owl",
  "Anonymous Raver",
  "Creature of the Night",
];
function distance(lat: number, lon: number, event: Event) {
  if (event.latitude === null || event.longitude === null) return Infinity;
  const rad = (n: number) => (n * Math.PI) / 180;
  const a =
    Math.sin(rad(event.latitude - lat) / 2) ** 2 +
    Math.cos(rad(lat)) *
      Math.cos(rad(event.latitude)) *
      Math.sin(rad(event.longitude - lon) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function HomeScreen() {
  const navbarScroll = useNavbarScroll();
  const reduced = useReducedMotion();
  const { user, ready } = useAuth();
  const { copy } = usePreferences(),
    insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const events = useHomeEvents(),
    scroll = useRef<ScrollViewInstance>(null);
  useScrollToTop(scroll);
  const promoted = useQuery({
    ...manualRefreshOptions,
    queryKey: ["promotions"],
    queryFn: ({ signal }) => eventsApi.promotions(signal),
  });
  const [promotionSeed] = useState(() => String(Date.now()));
  const bannerPromotions = useMemo(() => (promoted.data ?? []).filter(p => p.placement === 'home_banner'), [promoted.data]);
  const feedPromotions = (promoted.data ?? []).filter(p => p.placement === 'feed');
  const campaigns = new Map(feedPromotions.map(p => [p.event.id, p.campaignId]));
  const [refreshing, setRefreshing] = useState(false);
  const [heroRefreshKey, setHeroRefreshKey] = useState(0);
  const refreshPending = useRef(false);
  const refresh = async () => {
    if (refreshPending.current) return;
    refreshPending.current = true;
    setRefreshing(true);
    try {
      await Promise.allSettled([
        events.refetch({ cancelRefetch: false }),
        promoted.refetch({ cancelRefetch: false }),
      ]);
    } finally {
      refreshPending.current = false;
      setRefreshing(false);
      setHeroRefreshKey(current => current + 1);
    }
  };
  const [location, setLocation] = useState<Location.LocationObject | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") return;
      const value =
        (await Location.getLastKnownPositionAsync({ maxAge: 300000 })) ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      if (active) setLocation(value);
    })().catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const now = useEventClock(),
    today = new Date(now),
    midnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1,
    ).getTime();
  const active = (events.data ?? []).filter((e) => Date.parse(e.endTime) > now);
  const tonight = active.filter((e) => Date.parse(e.startTime) < midnight);
  const live = active.filter((e) => isLive(e, now));
  const upcoming = active
    .filter((e) => Date.parse(e.startTime) > now)
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const nearby = location
    ? active
        .filter(
          (e) =>
            distance(location.coords.latitude, location.coords.longitude, e) <=
            25,
        )
        .sort(
          (a, b) =>
            distance(location.coords.latitude, location.coords.longitude, a) -
            distance(location.coords.latitude, location.coords.longitude, b),
        )
    : [];
  const open = (event: Event) => {
    seedEvent(event);
    navigation.navigate("Event", { id: event.id });
  };
  const more = (date?: string) =>
    navigation.navigate("Tabs", {
      screen: "Explore",
      params: { date: date ?? "See all" },
    });
  const rails = [
    { key: "common.liveNow", items: live, date: "Tonight" },
    {
      key: "home.tonight",
      items: tonight.filter((e) => !isLive(e, now)),
      date: "Tonight",
    },
    { key: "home.nearYou", items: mixFeedPromotions(nearby, feedPromotions, promotionSeed + ':nearby', e => Date.parse(e.endTime) > now && !!location && distance(location.coords.latitude, location.coords.longitude, e) <= 25) },
    { key: "home.upcoming", items: mixFeedPromotions(upcoming, feedPromotions, promotionSeed + ':upcoming', e => Date.parse(e.startTime) > now) },
  ];
  return (
    <View style={{ flex: 1 }}>
    <RefreshScrollView
      {...navbarScroll}
      ref={scroll}
      testID="home-list"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{
        paddingTop: Math.max(24, insets.top),
        paddingBottom: 110,
      }}
      refreshing={refreshing}
      onRefresh={refresh}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: 20 }}>
        <View style={s.header}>
          <Logo size={32} />
          <GlassButtonGroup testID="home-header-actions">
          {user && <NotificationsPopover key={user.id} />}
          <GlassPressable fallback={Pressable}
            testID="home-search"
            accessibilityLabel={copy("search.open")}
            accessibilityRole="button"
            onPress={() => navigation.navigate("Search")}
            style={s.search}
          >
            <ActionIcon name="search" size={16} color={colors.accent} />
          </GlassPressable>
          </GlassButtonGroup>
        </View>
        <Text style={s.greeting}>
          {ready ? copy("home.hello", { name: user?.username || guests[today.getDate() % 4]! }) : copy('common.loading')}
        </Text>
        <Text style={s.tonight}>
          {events.isPending
            ? copy("common.loading")
            : copy("home.exploreTonight", { count: tonight.length })}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 20 }}><WardrobeCard /></View>
      {promoted.isPending && !promoted.data ? <HomeLoading hero /> : <PromotionHero
        items={bannerPromotions}
        onOpen={open}
        refreshKey={heroRefreshKey}
        refreshing={refreshing}
      />}
      {events.isPending ? (
        <HomeLoading />
      ) : events.isError && !events.data ? (
        <Feedback
          title={copy("home.eventsUnavailable")}
          retry={() => void events.refetch()}
        />
      ) : (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(180)}>
          {events.isError && (
            <Feedback
              compact
              title={copy("home.eventsUnavailable")}
              retry={() => void events.refetch()}
            />
          )}
          {rails
            .filter((rail) => rail.items.length || rail.key === "home.upcoming")
            .map((rail) => (
              <View key={rail.key} style={{ marginTop: 16 }}>
                <View style={s.railHeader}>
                  <Text style={s.railTitle}>{copy(rail.key)}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => more(rail.date)}
                    style={{ height: 32, justifyContent: "center" }}
                  >
                    <Text style={s.more}>{copy("common.seeAll")}</Text>
                  </Pressable>
                </View>
                {rail.items.length ? (
                  <FlatList
                    horizontal
                    data={rail.items.slice(0, 8)}
                    keyExtractor={(e) => e.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{
                      paddingHorizontal: 20,
                      gap: 16,
                      paddingBottom: 8,
                      paddingTop: 8,
                    }}
                    renderItem={({ item }) => (
                      <VisiblePromotion campaignId={campaigns.get(item.id)}><EventCard promoted={campaigns.has(item.id)} event={item} onOpen={() => { trackPromotion(campaigns.get(item.id), 'click'); open(item); }} /></VisiblePromotion>
                    )}
                  />
                ) : (
                  <View style={s.empty}>
                    <Text style={{ color: colors.muted, fontSize: 14 }}>
                      {copy("home.noUpcoming")}
                    </Text>
                  </View>
                )}
              </View>
            ))}
        </Animated.View>
      )}
    </RefreshScrollView>
    </View>
  );
}
const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  search: {
    height: 40,
    width: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#ffffff0f",
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 28,
  },
  tonight: { marginTop: 4, color: colors.accent, fontSize: 14 },
  railHeader: {
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  railTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  more: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  empty: {
    margin: 20,
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#ffffff26",
  },
});
