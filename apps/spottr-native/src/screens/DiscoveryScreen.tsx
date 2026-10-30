import type { FlatListInstance } from 'react-native';
import { GlassPressable } from '../ui/GlassPressable';
import { GlassButtonGroup } from '../ui/GlassButtonGroup';
import { GlassSurface } from '../ui/GlassSurface';
import { ActionIcon } from '../ui/ActionIcon';
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { List, Map as MapIcon, SlidersHorizontal } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useNavigation,
  useRoute,
  useScrollToTop,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { categories, type Event, type EventFilters } from "../data/events";
import { useEvents, seedEvent } from "../data/queries";
import { usePreferences } from "../PreferencesProvider";
import { EventBrowseCard } from "../ui/EventBrowseCard";
import {
  Feedback,
  Loading,
  webListScrollProps,
} from "../ui/common";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import { EventsMapPanel } from '../map/EventsMapPanel';
import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '../data/api';
import { mixFeedPromotions } from '../../../pulse-app/src/features/events/promotions';
import { VisiblePromotion, trackPromotion } from '../ui/VisiblePromotion';
import { useNavbarScroll } from '../navigation/useNavbarScroll';
import type { RootParamList, TabsParamList } from "../navigation/types";
import { getEventDateRange } from "../../../pulse-app/src/features/events/dateFilters";
import {
  defaultEventFilters,
  cityCenters,
  eventCities,
  eventDateFilters,
  eventVibes,
} from "../../../pulse-app/src/features/events/constants";

const dateKeys = [
  "filters.seeAll",
  "filters.tonight",
  "filters.tomorrow",
  "filters.weekend",
  "filters.nextWeek",
];
export function DiscoveryScreen() {
  const { copy } = usePreferences(),
    insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const route =
    useRoute<BottomTabScreenProps<TabsParamList, "Explore">["route"]>();
  const [filters, setFilters] = useState(defaultEventFilters),
    [draft, setDraft] = useState(defaultEventFilters),
    [open, setOpen] = useState(false),
    [cityOpen, setCityOpen] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const navbarScroll = useNavbarScroll(view === 'list');
  const list = useRef<FlatListInstance>(null);
  useScrollToTop(list);
  useEffect(() => {
    if (route.params?.date)
      setFilters((current) => ({ ...current, date: route.params!.date! }));
  }, [route.params]);
  const query = useMemo<EventFilters>(() => {
    const range = getEventDateRange(filters.date);
    return {
      category: filters.categories.join(","),
      vibe: filters.vibes.join(","),
      city: filters.city,
      ...range,
      startsAfter: range.startsAfter ?? new Date().toISOString(),
    };
  }, [filters]);
  const events = useEvents(query);
  const promotions = useQuery({ queryKey: ['promotions'], queryFn: ({ signal }) => eventsApi.promotions(signal) });
  const [promotionSeed] = useState(() => String(Date.now()));
  const feedPromotions = (promotions.data ?? []).filter(p => p.placement === 'feed');
  const campaigns = new Map(feedPromotions.map(p => [p.event.id, p.campaignId]));
  const displayed = mixFeedPromotions(events.items, feedPromotions, promotionSeed, event => (!filters.categories.length || filters.categories.includes(event.category)) && (!filters.vibes.length || filters.vibes.includes(event.vibe)) && (!filters.city || filters.city === event.city) && (!query.startsAfter || Date.parse(event.endTime) > Date.parse(query.startsAfter)) && (!query.startsBefore || Date.parse(event.startTime) < Date.parse(query.startsBefore)), 3);
  useEffect(() => { if (view === 'map') events.loadMore(); }, [view, events.data, events.isFetching, events.hasNextPage]);
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [query]);
  const choose = (key: "categories" | "vibes", value: string) =>
    setDraft((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((v) => v !== value)
        : [...current[key], value],
    }));
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: view === 'map' ? 0 : Math.max(24, insets.top),
      }}
    >
      <GlassButtonGroup
        testID="discovery-header-actions"
        style={{
          paddingHorizontal: 20,
          paddingBottom: 20,
          ...(view === 'map' ? { position: 'absolute', left: 0, right: 64, top: Math.max(24, insets.top), zIndex: 10 } as const : {}),
        }}
      >
        <GlassSurface testID="events-view-switch" style={s.toggle}>
          <Pressable
            testID="events-list-toggle"
            accessibilityRole="button"
            accessibilityLabel={copy("eventMap.list")}
            accessibilityState={{ selected: view === 'list' }}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[s.mode, view === 'list' && { backgroundColor: colors.accent }]}
            onPress={() => setView('list')}
          >
            <List size={16} color={view === 'list' ? 'black' : '#ffffffb3'} />
          </Pressable>
          <Pressable
            testID="events-map-toggle"
            accessibilityRole="button"
            accessibilityLabel={copy("eventMap.map")}
            accessibilityState={{ selected: view === 'map' }}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[s.mode, view === 'map' && { backgroundColor: colors.accent }]}
            onPress={() => setView('map')}
          >
            <MapIcon size={16} color={view === 'map' ? 'black' : '#ffffffb3'} />
          </Pressable>
        </GlassSurface>
        <GlassPressable fallback={Pressable}
          testID="event-filters"
          accessibilityRole="button"
          accessibilityLabel={copy("common.filters")}
          onPress={() => {
            setDraft(filters);
            setOpen(true);
          }}
          style={s.filter}
        >
          <SlidersHorizontal size={16} color="#ffffffb3" />
        </GlassPressable>
      </GlassButtonGroup>
      {view === 'map' ? <EventsMapPanel events={events.items} distance={filters.distance} cityCenter={cityCenters[filters.city] ? { latitude: cityCenters[filters.city]![0], longitude: cityCenters[filters.city]![1] } : null} onOpen={event => { seedEvent(event); navigation.navigate('Event', { id: event.id }); }} loading={events.isFetching} error={events.isError} retry={() => void (events.isFetchNextPageError ? events.fetchNextPage() : events.refetch())} /> : <FlatList
        ref={list}
        {...navbarScroll}
        style={{ flex: 1 }}
        testID="events-list"
        data={displayed}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 110,
          gap: 20,
        }}
        renderItem={({ item }) => (
          <VisiblePromotion campaignId={campaigns.get(item.id)} style={{ flex: 1, maxWidth: '48.5%' }}><EventBrowseCard fill promoted={campaigns.has(item.id)}
            event={item}
            onOpen={() => {
              seedEvent(item);
              trackPromotion(campaigns.get(item.id), 'click');
              navigation.navigate("Event", { id: item.id });
            }}
          /></VisiblePromotion>
        )}
        ListEmptyComponent={
          events.isPending ? (
            <Loading />
          ) : events.isError ? (
            <Feedback
              title={copy("feedback.loadFailed")}
              retry={() => void events.refetch()}
            />
          ) : (
            <View style={s.empty}>
              <Text
                style={{ color: colors.text, fontSize: 14, fontWeight: "500" }}
              >
                {copy("events.noMatch")}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                {copy("events.tryAnother")}
              </Text>
              <Pressable
                onPress={() =>
                  setFilters({ ...defaultEventFilters, distance: 50 })
                }
              >
                <Text
                  style={{
                    color: colors.accent,
                    fontSize: 14,
                    fontWeight: "500",
                    marginTop: 12,
                  }}
                >
                  {copy("events.resetFilters")}
                </Text>
              </Pressable>
            </View>
          )
        }
        {...webListScrollProps(events.loadMore)}
        onEndReached={events.loadMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          events.isFetchingNextPage ? (
            <ActivityIndicator color={colors.accent} style={{ padding: 20 }} />
          ) : events.isError && events.items.length > 0 ? (
            <Feedback
              title={copy("feedback.loadFailed")}
              retry={() =>
                void (events.isFetchNextPageError
                  ? events.fetchNextPage()
                  : events.refetch())
              }
            />
          ) : undefined
        }
      />}
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#000000b3",
            paddingTop: 64,
            paddingBottom: 12,
            paddingHorizontal: 12,
          }}
        >
          <View style={s.panel}>
            <View style={s.panelHeader}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <SlidersHorizontal size={16} color={colors.accent} />
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {copy("filters.title")}
                </Text>
              </View>
              <GlassPressable fallback={Pressable}
                accessibilityLabel={copy("common.close")}
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                style={s.close}
              >
                <ActionIcon name="close" size={14} color="white" />
              </GlassPressable>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 24, paddingTop: 20, gap: 24 }}
            >
              <Section title={copy("filters.when")}>
                <View style={s.wrap}>
                  {eventDateFilters.map((date, index) => (
                    <Chip
                      key={date}
                      label={copy(dateKeys[index]!)}
                      active={draft.date === date}
                      onPress={() => setDraft({ ...draft, date })}
                    />
                  ))}
                </View>
              </Section>
              <Section title={copy("filters.city")}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setCityOpen(!cityOpen)}
                  style={s.city}
                >
                  <Text style={{ fontSize: 14, color: colors.text }}>
                    {draft.city || copy("filters.allCities")} ▾
                  </Text>
                </Pressable>
                {cityOpen && (
                  <View style={{ gap: 8, paddingTop: 8 }}>
                    {["", ...eventCities].map((city) => (
                      <Chip
                        key={city}
                        label={city || copy("filters.allCities")}
                        active={draft.city === city}
                        onPress={() => {
                          setDraft({ ...draft, city });
                          setCityOpen(false);
                        }}
                      />
                    ))}
                  </View>
                )}
              </Section>
              <Section title={copy("filters.categories")}>
                <View style={s.wrap}>
                  {categories.map((value) => (
                    <Chip
                      key={value}
                      label={value}
                      active={draft.categories.includes(value)}
                      onPress={() => choose("categories", value)}
                    />
                  ))}
                </View>
              </Section>
              <Section title={copy("filters.vibe")}>
                <View style={s.wrap}>
                  {eventVibes.map((value) => (
                    <Chip
                      key={value}
                      label={value}
                      active={draft.vibes.includes(value)}
                      onPress={() => choose("vibes", value)}
                    />
                  ))}
                </View>
              </Section>
              <Section
                title={
                  copy("filters.distance") +
                  " · " +
                  copy("filters.distanceValue", { distance: draft.distance })
                }
              >
                <DistanceSlider
                  value={draft.distance}
                  onChange={(distance) => setDraft({ ...draft, distance })}
                />
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={s.small}>
                    {copy("filters.distanceValue", { distance: 1 })}
                  </Text>
                  <Text style={s.small}>
                    {copy("filters.distanceValue", { distance: 50 })}
                  </Text>
                </View>
              </Section>
            </ScrollView>
            <View style={s.actions}>
              <Pressable
                style={s.reset}
                onPress={() => setDraft(defaultEventFilters)}
              >
                <Text style={{ fontSize: 14, color: colors.text }}>
                  {copy("common.reset")}
                </Text>
              </Pressable>
              <Pressable
                testID="apply-filters"
                style={s.apply}
                onPress={() => {
                  setFilters(draft);
                  setOpen(false);
                }}
              >
                <Text
                  style={{ fontSize: 14, fontWeight: "600", color: "white" }}
                >
                  {copy("common.applyFilters")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
function Section({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>) {
  return (
    <View>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "500",
          color: colors.muted,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        s.chip,
        active && { borderColor: "#ff004499", backgroundColor: "#ff004426" },
      ]}
    >
      <Text
        style={{ fontSize: 14, color: active ? colors.accent : "#ffffffd9" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function DistanceSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [width, setWidth] = useState(1);
  const position = (value - 1) / 49;
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 1, max: 50, now: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) =>
        onChange(
          Math.min(
            50,
            Math.max(
              1,
              value + (event.nativeEvent.actionName === "increment" ? 1 : -1),
            ),
          ),
        )
      }
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(event) =>
        onChange(
          Math.max(
            1,
            Math.min(
              50,
              Math.round((event.nativeEvent.locationX / width) * 49 + 1),
            ),
          ),
        )
      }
      onResponderMove={(event) =>
        onChange(
          Math.max(
            1,
            Math.min(
              50,
              Math.round((event.nativeEvent.locationX / width) * 49 + 1),
            ),
          ),
        )
      }
      style={{ height: 32, justifyContent: "center" }}
    >
      <View
        pointerEvents="none"
        style={{ height: 4, borderRadius: 2, backgroundColor: "#ffffff33" }}
      >
        <View
          style={{
            height: 4,
            width: (position * 100 + "%") as `${number}%`,
            backgroundColor: colors.accent,
          }}
        />
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: Math.max(0, position * (width - 16)),
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: colors.accent,
        }}
      />
    </View>
  );
}
const s = StyleSheet.create({
  toggle: {
    flexDirection: "row",
    height: 44,
    padding: 4,
    borderWidth: 1,
    borderColor: "#ffffff1a",
    backgroundColor: "#121418d9",
    borderRadius: 99,
  },
  mode: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 99,
  },
  filter: {
    height: 44,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#ffffff1a",
    backgroundColor: "#121418d9",
    borderRadius: 22,
  },
  empty: {
    marginTop: 48,
    paddingHorizontal: 20,
    paddingVertical: 40,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "#ffffff26",
    alignItems: "center",
  },
  panel: {
    flex: 1,
    backgroundColor: "#141414f2",
    borderWidth: 1,
    borderColor: "#ffffff26",
    borderRadius: 8,
    overflow: "hidden",
  },
  panelHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  close: {
    height: 32,
    width: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#ffffff0d",
    alignItems: "center",
    justifyContent: "center",
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#ffffff0d",
  },
  city: {
    padding: 14,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#ffffff0d",
  },
  small: { fontSize: 11, color: colors.muted },
  actions: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: "#ffffff1a",
    flexDirection: "row",
    gap: 12,
  },
  reset: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#ffffff0d",
  },
  apply: {
    flex: 1.6,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 99,
    backgroundColor: colors.accent,
  },
});
