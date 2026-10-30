import type { FlatListInstance, ScrollViewInstance } from 'react-native';
import { ActionIcon } from '../ui/ActionIcon';
import { GlassSurface } from '../ui/GlassSurface';
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, Pressable as NativePressable, ScrollView, StyleSheet, View } from "react-native";
import { FormInput as TextInput } from '../ui/FormInput';
import { MotionPressable as Pressable } from "../ui/MotionPressable";
import { ArrowUpRight, BadgeCheck, Clock3, Search, UserRound, X } from "lucide-react-native";
import { useRecentSearches } from '../search/useRecentSearches';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { profilesApi } from '../profiles/usePublicProfile';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { usePreferences } from "../PreferencesProvider";
import { seedEvent, useEvents, useHomeEvents } from "../data/queries";
import { formatDate } from "../data/events";
import {
  EventImage,
  Feedback,
  IconButton,
  Loading,
  webListScrollProps,
} from "../ui/common";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import type { RootParamList } from "../navigation/types";

export function SearchScreen({
  navigation,
}: NativeStackScreenProps<RootParamList, "Search">) {
  const { copy, language } = usePreferences(),
    insets = useSafeAreaInsets();
  const { user, ready } = useAuth();
  const recent = useRecentSearches(user?.id ?? 'guest', ready);
  const [scope, setScope] = useState<'all' | 'events' | 'people' | 'organizers'>('all');
  const [focused, setFocused] = useState(false);
  const [value, setValue] = useState(""),
    [query, setQuery] = useState("");
  const results = useRef<FlatListInstance>(null);
  const scopeScroll = useRef<ScrollViewInstance>(null);
  const scopeOffsets = useRef<Record<string, number>>({});
  useEffect(() => { results.current?.scrollToOffset({ offset: 0, animated: false }); }, [query, scope]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(value.trim()), 180);
    return () => clearTimeout(timer);
  }, [value]);
  const filters = useMemo(
    () => ({ q: query, startsAfter: new Date().toISOString() }),
    [query],
  );
  const showEvents = !value.trim() || scope === 'all' || scope === 'events';
  const showProfiles = !!value.trim() && scope !== 'events';
  const profileKind = scope === 'people' ? 'people' : scope === 'organizers' ? 'organizers' : undefined;
  const events = useEvents(filters, query.length > 0 && showEvents),
    home = useHomeEvents();
  const profiles = useQuery({ queryKey: ['profile-search', user?.id ?? 'guest', query, profileKind], enabled: ready && query.length >= 2 && showProfiles,
    queryFn: ({ signal }) => profilesApi.search(query, signal, profileKind) });
  const profilesPending = value.trim() !== query || !ready || profiles.isPending;
  const recommended = (home.data ?? [])
    .filter((e) => Date.parse(e.endTime) > Date.now())
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
    .slice(0, 6);
  const data = !showEvents ? [] : query ? events.items : recommended,
    pending =
      value.trim() !== query || (query ? events.isPending : home.isPending);
  return (
    <View
      testID="search-screen"
      style={{
        flex: 1,
        backgroundColor: "#0a0a0a",
        paddingTop: Math.max(20, insets.top),
      }}
    >
      <View style={{ paddingHorizontal: 20, gap: 16, paddingBottom: 20 }}>
        <IconButton
          label={copy("common.back")}
          onPress={() => navigation.goBack()}
        >
          <ActionIcon name="back" color={colors.text} size={20} />
        </IconButton>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
          {copy("search.open")}
        </Text>
        <View style={[s.field, focused && { borderColor: '#ff004499' }]}>
          <Search size={20} color={colors.muted} />
          <TextInput variant="bare"
            testID="event-search"
            accessibilityLabel={copy("search.open")}
            style={s.input}
            value={value}
            placeholder={copy("search.placeholder")}
            placeholderTextColor={colors.muted}
            onChangeText={(value) =>
              setValue(Array.from(value).slice(0, 120).join(""))
            }
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
            returnKeyType="search"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={() => { recent.remember(value); setQuery(value.trim()); Keyboard.dismiss(); }}
          />
          {!!value && (
            <Pressable
              accessibilityRole="button"
              testID="search-clear"
              accessibilityLabel={copy("search.clearInput")}
              onPress={() => {
                setValue("");
                setQuery("");
              }}
              style={s.clear}
            >
              <X size={14} color={colors.muted} />
            </Pressable>
          )}
        </View>
        {!!value.trim() && <GlassSurface testID="search-filter-bar" style={s.filterBar}>
          <ScrollView ref={scopeScroll} horizontal showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled" contentContainerStyle={s.filterTrack}
            onContentSizeChange={() => scopeScroll.current?.scrollTo({ x: scopeOffsets.current[scope] ?? 0, animated: false })}>
            {(['all', 'events', 'people', 'organizers'] as const).map(kind => <NativePressable
              key={kind} testID={'search-filter-' + kind} accessibilityRole="tab"
              accessibilityLabel={copy('search.' + kind)} accessibilityState={{ selected: scope === kind }}
              aria-selected={scope === kind}
              onLayout={({ nativeEvent: { layout } }) => { scopeOffsets.current[kind] = Math.max(0, layout.x - 4); }}
              onPress={() => {
                setScope(kind);
                scopeScroll.current?.scrollTo({ x: scopeOffsets.current[kind] ?? 0, animated: false });
              }} style={[s.filter, scope === kind && s.filterActive]}>
              <Text style={[s.filterLabel, scope === kind && s.filterLabelActive]}>{copy('search.' + kind)}</Text>
            </NativePressable>)}
          </ScrollView>
        </GlassSurface>}
      </View>
      <FlatList
        ref={results}
        testID="search-results"
        data={pending ? [] : data}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 12,
          paddingBottom: Math.max(32, insets.bottom),
        }}
        ListHeaderComponent={
          <>
          {!value.trim() && !!recent.items.length && <View testID="recent-searches" style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={s.heading}>{copy('search.recent')}</Text><Pressable testID="search-clear-recent" accessibilityRole="button" onPress={recent.clear} style={{ padding: 12 }}><Text style={{ color: colors.accent, fontSize: 12 }}>{copy('search.clearRecent')}</Text></Pressable></View>
            {recent.items.map((item, index) => <View key={item} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable testID={'recent-search-' + index} accessibilityRole="button" onPress={() => { setValue(item); setQuery(item); setScope('all'); recent.remember(item); Keyboard.dismiss(); }} style={[s.row, { flex: 1, borderBottomWidth: 0 }]}><Clock3 size={17} color={colors.muted} /><Text numberOfLines={1} style={[s.title, { flex: 1, fontWeight: '400' }]}>{item}</Text></Pressable>
              <Pressable testID={'recent-remove-' + index} accessibilityRole="button" accessibilityLabel={copy('search.removeRecent', { query: item })} onPress={() => recent.remove(item)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={15} color={colors.muted} /></Pressable>
            </View>)}
          </View>}
          {showEvents && <Text style={s.heading}>
            {copy(query ? "search.events" : "search.recommended")}
          </Text>}
          </>
        }
        ListEmptyComponent={
          !showEvents ? undefined : pending ? (
            <Loading />
          ) : (query ? events.isError : home.isError) ? (
            <Feedback
              title={copy("feedback.loadFailed")}
              retry={() => void (query ? events.refetch() : home.refetch())}
            />
          ) : (
            <Text style={s.empty}>{copy("search.noEvents")}</Text>
          )
        }
        onEndReached={() => {
          if (query && !pending && showEvents) events.loadMore();
        }}
        onEndReachedThreshold={0.5}
        {...webListScrollProps(() => {
          if (query && !pending && showEvents) events.loadMore();
        }, 0.5)}
        ListFooterComponent={<>
          {
          showEvents && query && (events.isFetchingNextPage ? (
            <Loading />
          ) : events.isFetchNextPageError ? (
            <Feedback
              title={copy("feedback.loadFailed")}
              retry={() => void events.fetchNextPage()}
            />
          ) : null)}
          {showProfiles && value.trim().length < 2 && !showEvents && <Text style={s.empty}>{copy('search.minCharacters')}</Text>}
          {showProfiles && value.trim().length >= 2 && <View testID="profile-search-results">
            <Text style={s.heading}>{copy(profileKind ? 'search.' + profileKind : 'search.peopleAndOrganizers')}{!profilesPending && !profiles.isError ? ` · ${profiles.data?.length ?? 0}` : ''}</Text>
            {profilesPending ? <Loading /> : profiles.isError ? <Feedback compact title={copy('feedback.loadFailed')} retry={() => void profiles.refetch()} /> : profiles.data?.length ? profiles.data.map(profile => {
              const organizer = profile.role === 'organizer', Icon = organizer ? BadgeCheck : UserRound;
              return <Pressable key={profile.id} testID={'search-profile-' + profile.id} accessibilityRole="button" onPress={() => { recent.remember(query); navigation.replace('PublicProfile', { id: profile.id }); }} style={[s.row, { borderBottomWidth: 0, borderRadius: 16 }]}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#ffffff0d', alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color={colors.accent} /></View>
                <View style={{ flex: 1, gap: 4 }}><Text numberOfLines={1} style={s.title}>{organizer ? profile.organizerName || profile.username : '@' + profile.username}</Text><Text numberOfLines={1} style={s.meta}>{organizer ? copy('search.organizerMeta', { username: profile.username }) : profile.bio || copy('search.publicProfile')}</Text></View>
                <ArrowUpRight size={16} color={colors.muted} />
              </Pressable>;
            }) : <Text style={s.empty}>{copy('search.noProfiles')}</Text>}
          </View>}
        </>}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              if (query) recent.remember(query);
              seedEvent(item);
              navigation.replace("Event", {
                id: item.id,
                presentation: "page",
              });
            }}
            style={s.row}
          >
            <EventImage
              uri={item.bannerUrl}
              style={{ height: 56, width: 56, borderRadius: 12 }}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} style={s.title}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={s.meta}>
                {item.locationName} ·{" "}
                {formatDate(item.startTime, language, true)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
const s = StyleSheet.create({
  filterBar: { height: 54, borderRadius: 27, borderWidth: 1, borderColor: '#ffffff1a', backgroundColor: '#121418d9' },
  filterTrack: { minWidth: '100%', flexDirection: 'row', alignItems: 'center', padding: 4, gap: 2 },
  filter: { minHeight: 44, flexGrow: 1, flexShrink: 0, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  filterActive: { backgroundColor: colors.accent },
  filterLabel: { color: '#ffffffb3', fontSize: 13, fontWeight: '600' },
  filterLabelActive: { color: '#080808' },
  field: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: "#ffffff0d",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffff33",
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 62,
    color: colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  clear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff1a",
  },
  heading: {
    padding: 12,
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  empty: {
    paddingHorizontal: 12,
    paddingVertical: 20,
    fontSize: 14,
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#ffffff12",
  },
  title: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
    letterSpacing: 0.35,
  },
  meta: { fontSize: 12, color: colors.muted },
});
