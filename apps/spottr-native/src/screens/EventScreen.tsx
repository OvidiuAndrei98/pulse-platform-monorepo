import { haptic } from "../ui/haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  BadgeCheck,
  Bookmark,
  CalendarDays,
  Check,
  Share2,
  Ticket as TicketIcon,
  UserRound,
  UsersRound,
  Music2,
  MapPin,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { queryClient, useEvent } from "../data/queries";
import { availableTickets, eventUrl, formatDate, isLive } from "../data/events";
import { ApiError, eventsApi } from "../data/api";
import { useEventClock } from "../data/useEventClock";
import { usePreferences } from "../PreferencesProvider";
import { WEB_URL } from "../config";
import { EventImage, Feedback, Loading, useOpenLink } from "../ui/common";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import type { RootParamList } from "../navigation/types";
import {
  calculateServiceFeeRon,
  formatRon,
} from "../../../pulse-app/src/features/events/serviceFee";
import { AppSheetScrollView } from "../ui/AppSheetScrollView";
import { AppSheet } from "../ui/AppSheet";
import { ArrowLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { EventSocial } from "../ui/EventSocial";
import { validSelection, parseBooking } from "../checkout/data";
import { OrganizerUpdates } from '../profiles/OrganizerUpdates';
import { EventAttendees } from '../social/EventAttendees';

export function EventScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootParamList, "Event" | "EventDetails">) {
  const isSheet = route.params.presentation !== "page";
  const ContentScroll = isSheet ? AppSheetScrollView : ScrollView;
  const safe = useSafeAreaInsets();
  const { user, controller } = useAuth();
  const [buying, setBuying] = useState(false), [purchaseError, setPurchaseError] = useState<string | null>(null);
  const pending = useRef(false), revision = useRef(0);
  useEffect(() => { revision.current++; pending.current = false; setBuying(false); setPurchaseError(null); return () => { revision.current++; }; }, [route.params.id, user?.id]);
  const { copy, language, saved, toggleSaved, ready } = usePreferences();
  const query = useEvent(route.params.id),
    event = query.data,
    now = useEventClock(event),
    { height } = useWindowDimensions();
  const organizer = useQuery({
    queryKey: ["profile", event?.organizerId],
    enabled: !!event?.organizerId,
    queryFn: ({ signal }) => eventsApi.profile(event!.organizerId, signal),
  });
  const link = useOpenLink(),
    [shareError, setShareError] = useState(false),
    [selected, setSelected] = useState<string>();
  const available = event ? availableTickets(event, now) : [],
    ticket = available.find((t) => t.id === selected);
  useEffect(() => {
    if (!selected && available[0]) setSelected(available[0].id);
    else if (selected && !available.some((t) => t.id === selected))
      setSelected(undefined);
  }, [available.map((t) => t.id).join(","), selected]);
  const missing = query.error instanceof ApiError && query.error.status === 404;
  const close = () => navigation.goBack();
  const ended = !!event && Date.parse(event.endTime) <= now;
  const external = event?.externalTicketUrl;
  const ownEvent = !!user && event?.organizerId === user.id;
  const canBuy = !ended && !ownEvent && (!!ticket || !!external);
  const signIn = () => navigation.navigate("Auth", { mode: "login", returnEvent: route.params.id });
  const purchase = async () => {
    if (!event || !canBuy || pending.current) return;
    if (external) { void link.open(external); return; }
    if (!ticket) return;
    if (ticket.priceRon === 0 && !user) { signIn(); return; }
    pending.current = true; setBuying(true); setPurchaseError(null);
    const version = revision.current, token = controller.getToken();
    let verified = false;
    try {
      const fresh = await eventsApi.event(event.id);
      if (version !== revision.current || controller.getToken() !== token) return;
      queryClient.setQueryData(["event", event.id], fresh);
      verified = true;
      if (!validSelection(fresh, { [ticket.id]: 1 }, user?.id)) { setPurchaseError("checkout.selectionUnavailable"); return; }
      const freshTicket = fresh.ticketTypes.find(t => t.id === ticket.id)!;
      if (freshTicket.priceRon > 0) { navigation.navigate("Checkout", { eventId: event.id, ticketTypeId: ticket.id }); return; }
      if (!user) { signIn(); return; }
      parseBooking(await accountApi('/events/' + event.id + '/tickets/book', { token, method: 'POST', body: { items: [{ ticketTypeId: ticket.id, quantity: 1 }] } }));
      if (version !== revision.current || controller.getToken() !== token) return;
      for (const key of ['tickets', 'orders', 'event', 'event-social', 'event-friends', 'social-feed']) void queryClient.invalidateQueries({ queryKey: [key] });
      navigation.popTo('Tabs', { screen: 'Profile', params: { screen: 'Tickets' } });
    } catch (cause) {
      if (version !== revision.current || controller.getToken() !== token) return;
      setPurchaseError(cause instanceof ApiError && cause.status === 409 ? 'checkout.selectionUnavailable' : verified ? 'eventSheet.purchaseError' : 'checkout.availabilityCheckFailed');
      if (cause instanceof ApiError && cause.status === 409) void query.refetch();
    } finally { if (version === revision.current) { pending.current = false; setBuying(false); } }
  };
  const total = ticket
    ? ticket.priceRon +
      (event?.organizerAbsorbsServiceFee
        ? 0
        : calculateServiceFeeRon(ticket.priceRon, 1))
    : 0;
  const share = async () => {
    if (!event) return;
    setShareError(false);
    try {
      if (Platform.OS === 'web' && !navigator.share) { await navigator.clipboard.writeText(eventUrl(WEB_URL, event.id)); return; }
      await Share.share({
        title: event.title,
        message: event.title + "\n" + eventUrl(WEB_URL, event.id),
      });
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setShareError(true);
    }
  };
  const content = (
    <View
      testID="event-sheet"
      style={[
        s.sheet,
        !isSheet && { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
      ]}
    >
      {!isSheet && (
        <View
          style={{
            paddingTop: safe.top + 12,
            paddingHorizontal: 20,
            paddingBottom: 12,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy("common.back")}
            onPress={close}
            style={s.icon}
          >
            <ArrowLeft color="white" size={20} />
          </Pressable>
        </View>
      )}
      {!event || missing ? (
        <View style={{ flex: 1 }}>
          {query.isPending ? (
            <Loading />
          ) : (
            <Feedback
              title={
                missing ? copy("common.noEvents") : copy("feedback.loadFailed")
              }
              retry={missing ? undefined : () => void query.refetch()}
            />
          )}
        </View>
      ) : (
        <>
          <ContentScroll
            testID="event-content"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={s.hero}>
              {event.bannerUrl && (
                <EventImage
                  uri={event.bannerUrl}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <LinearGradient
                colors={["#00000066", "transparent", "#000000f2"]}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={["transparent", "#00000066", "#000000f2"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={s.badges}>
                <View
                  style={[
                    s.badge,
                    isLive(event, now) && {
                      backgroundColor: "#ef444433",
                      borderColor: "#ef444466",
                    },
                  ]}
                >
                  {!isLive(event, now) && !ended && (
                    <CalendarDays size={14} color={colors.accent} />
                  )}
                  <Text
                    style={{
                      color: isLive(event, now) ? "#f87171" : "white",
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                  >
                    {ended
                      ? copy("eventSheet.eventCompleted")
                      : isLive(event, now)
                        ? "● " + copy("common.liveNow").toUpperCase()
                        : formatDate(event.startTime, language, true)}
                  </Text>
                </View>
              </View>
              <View style={s.heroText}>
                <Text style={s.category}>{event.category}</Text>
                <Text style={s.title}>{event.title}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    navigation.navigate('PublicProfile', { id: event.organizerId })
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <View style={s.avatar}>
                    {organizer.data?.avatarUrl ? (
                      <EventImage
                        uri={organizer.data.avatarUrl}
                        style={StyleSheet.absoluteFill}
                      />
                    ) : (
                      <UserRound size={14} color="#ffffffb3" />
                    )}
                  </View>
                  <Text style={{ color: "#a1a1aa", fontSize: 12 }}>
                    {copy("eventPage.organizedBy")}
                  </Text>
                  <Text
                    style={{
                      color: "white",
                      fontSize: 12,
                      fontWeight: "600",
                      flexShrink: 1,
                    }}
                  >
                    {organizer.data?.organizerName ||
                      organizer.data?.username ||
                      copy("eventSheet.organizer")}
                  </Text>
                  {organizer.data?.organizerVerified && (
                    <BadgeCheck size={14} color={colors.accent} />
                  )}
                </Pressable>
              </View>
            </View>
            <View style={s.content}>
              {query.isError && (
                <Feedback
                  compact
                  title={copy("feedback.loadFailed")}
                  retry={() => void query.refetch()}
                />
              )}
              <EventSocial eventId={event.id} signIn={signIn} />
              <EventAttendees eventId={event.id} compact={isSheet}/>
              <View>
                <Text style={s.heading}>{copy("eventSheet.about")}</Text>
                <Text style={s.description}>
                  {event.description || copy("eventSheet.noDescription")}
                </Text>
              </View>
              <OrganizerUpdates id={event.id} kind="events" openEvent={() => {}} />
              {!!event.lineup.length && (
                <View style={{ gap: 16 }}>
                  <Text style={s.heading}>{copy("lineup.title")}</Text>
                  {event.lineup.map((artist) => (
                    <View
                      key={artist.id}
                      style={{
                        flexDirection: "row",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <EventImage
                        uri={artist.imageUrl}
                        style={{ height: 48, width: 48, borderRadius: 24 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: "white",
                            fontSize: 14,
                            fontWeight: "600",
                          }}
                        >
                          {artist.name}
                        </Text>
                        {artist.isHeadliner && <Text style={{ color: colors.accent, fontSize: 10, marginTop: 3 }}>Headliner</Text>}
                        {!!artist.stage && <Text style={{ color: colors.muted, fontSize: 12 }}>{artist.stage}</Text>}
                        {!!artist.performanceTime && (
                          <Text style={{ fontSize: 12, color: colors.muted }}>
                            {artist.performanceTime}
                          </Text>
                        )}
                      </View>
                      {!!artist.spotifyUrl && <Pressable accessibilityRole="link" accessibilityLabel={artist.name + ' · Spotify'} onPress={() => void link.open(artist.spotifyUrl!)} style={{ padding: 8 }}><Music2 size={18} color={colors.accent}/></Pressable>}
                    </View>
                  ))}
                </View>
              )}
              {!external && !!event.ticketTypes.length && (
                <View style={{ gap: 10 }}>
                  <Text style={[s.heading, { marginBottom: 2 }]}>
                    {copy("eventSheet.tickets")}
                  </Text>
                  {[...event.ticketTypes]
                    .sort((a, b) => a.priceRon - b.priceRon)
                    .map((tier) => {
                      const enabled =
                          !ended && available.some((t) => t.id === tier.id),
                        checked = enabled && tier.id === selected;
                      return (
                        <Pressable
                          key={tier.id}
                          accessibilityRole="radio"
                          accessibilityState={{ checked, disabled: !enabled || buying }}
                          disabled={!enabled || buying}
                          onPress={() => { if (!pending.current && selected !== tier.id) { haptic("selection"); setSelected(tier.id); } }}
                          style={[
                            s.tier,
                            checked && {
                              borderColor: colors.accent,
                              backgroundColor: "#ff00441a",
                            },
                            !enabled && { opacity: 0.5 },
                          ]}
                        >
                          <View
                            style={[
                              s.radio,
                              checked && {
                                borderColor: colors.accent,
                                backgroundColor: colors.accent,
                              },
                            ]}
                          >
                            {checked && <Check size={16} color="white" />}
                          </View>
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text
                              style={{
                                fontSize: 14,
                                fontWeight: "600",
                                color: "white",
                              }}
                            >
                              {tier.name}
                            </Text>
                            {!!tier.description && (
                              <Text
                                style={{
                                  fontSize: 12,
                                  lineHeight: 20,
                                  color: "#ffffff80",
                                }}
                              >
                                {tier.description}
                              </Text>
                            )}
                          </View>
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: "700",
                              color: colors.accent,
                            }}
                          >
                            {enabled
                              ? tier.priceRon === 0
                                ? copy("checkout.free")
                                : formatRon(tier.priceRon)
                              : copy(
                                  (tier.ticketsSold ?? 0) >= tier.capacity
                                    ? "checkout.soldOut"
                                    : Date.parse(tier.startSales) > now
                                      ? "checkout.salesNotStarted"
                                      : "checkout.salesEnded",
                                )}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              )}
              {!isSheet && <Pressable accessibilityRole="link" onPress={() => void link.open('https://maps.google.com/?q=' + encodeURIComponent(event.latitude !== null && event.longitude !== null ? `${event.latitude},${event.longitude}` : `${event.locationName} ${event.city}`))} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 16, borderTopWidth: 1, borderColor: '#ffffff1a' }}><MapPin color={colors.accent} size={20}/><Text style={{ flex: 1, color: colors.text }}>{event.locationName} · {event.city}</Text></Pressable>}
              {purchaseError && <Feedback compact title={copy(purchaseError)} />}
              {(shareError || link.error) && (
                <Feedback
                  compact
                  title={copy(
                    shareError
                      ? "feedback.shareFailed"
                      : "feedback.actionFailed",
                  )}
                />
              )}
            </View>
          </ContentScroll>
          <View style={s.footer}>
            <Pressable
              disabled={!ready}
              accessibilityRole="button"
              accessibilityLabel={copy(
                saved.some((e) => e.id === event.id)
                  ? "eventSheet.removeFavorite"
                  : "eventSheet.addFavorite",
              )}
              onPress={() => user ? toggleSaved(event) : signIn()}
              style={s.icon}
            >
              <Bookmark
                size={16}
                color={
                  saved.some((e) => e.id === event.id) ? colors.accent : "white"
                }
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy("eventSheet.share")}
              onPress={() => void share()}
              style={s.icon}
            >
              <Share2 size={16} color="white" />
            </Pressable>
            <Pressable
              testID="event-continue"
              accessibilityRole="button"
              disabled={!canBuy || query.isError || buying}
              onPress={() => void purchase()}
              style={[
                s.purchase,
                (!canBuy || query.isError || buying) && { opacity: 0.4 },
              ]}
            >
              <TicketIcon size={16} color="white" />
              <Text style={{ fontSize: 14, fontWeight: "600", color: "white" }}>
                {buying ? copy("checkout.checkingTicketAvailability") : ownEvent ? copy("eventPage.cannotBuyOwn") : ended
                  ? copy("eventSheet.eventCompleted")
                  : external
                    ? copy("eventSheet.externalTickets")
                    : ticket
                      ? ticket.priceRon === 0 ? copy("checkout.bookFree") : copy("eventSheet.continue", {
                          count: 1,
                          total: formatRon(total),
                        })
                      : copy("eventSheet.selectTickets")}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
  return isSheet ? (
    <AppSheet open embedded edgeToEdge label={copy("common.close")} onClose={close}>
      {content}
    </AppSheet>
  ) : (
    content
  );
}
const s = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: "#000",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },
  handle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  hero: { height: 256, backgroundColor: "#0a0a0a" },
  badges: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 40,
    flexDirection: "row",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: "#ffffff26",
    backgroundColor: "#00000066",
  },
  heroText: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 20 },
  category: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: colors.accent,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.6,
    lineHeight: 30,
    color: "white",
    marginTop: 4,
  },
  avatar: {
    height: 28,
    width: 28,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ffffff33",
    backgroundColor: "#ffffff1a",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { paddingHorizontal: 20, paddingTop: 20, gap: 24 },
  heading: { fontSize: 14, fontWeight: "600", color: colors.text },
  description: { fontSize: 14, lineHeight: 23, color: "#d4d4d8", marginTop: 8 },
  social: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#ffffff1a",
    paddingVertical: 16,
    gap: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  signIn: {
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ffffff26",
    borderRadius: 99,
  },
  tier: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffff1a",
    backgroundColor: "#ffffff08",
    padding: 16,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffffff4d",
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: "black",
  },
  icon: {
    height: 44,
    width: 44,
    borderRadius: 22,
    backgroundColor: "#ffffff0d",
    borderWidth: 1,
    borderColor: "#ffffff1a",
    alignItems: "center",
    justifyContent: "center",
  },
  purchase: {
    height: 44,
    flex: 1,
    borderRadius: 99,
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
