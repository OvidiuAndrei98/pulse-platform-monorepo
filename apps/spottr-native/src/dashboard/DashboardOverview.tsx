import React from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  Calendar,
  MapPin,
  Megaphone,
  Plus,
  ScanLine,
  Ticket,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { EventImage, Feedback, Loading } from "../ui/common";
import { formatDate } from "../data/events";
import { Action, dColors as colors } from "./common";
import type { DashboardEvent } from "./data";
import { Grid } from "./managementUi";
import {
  dashboardTicketCounts,
  isDashboardEventLive,
  selectDashboardEvent,
} from "../../../pulse-app/src/features/events/dashboardFeatured";
import { useEventClock } from "../data/useEventClock";
import {
  dashboardEventGroups,
  type DashboardEventFilter,
} from "../../../pulse-app/src/features/events/dashboardEvents";

export function DashboardTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { width } = useWindowDimensions();
  return (
    <View style={{ gap: 4 }}>
      <Text
        style={{
          fontSize: width >= 640 ? 30 : 24,
          lineHeight: width >= 640 ? 36 : 32,
          fontWeight: "700",
          letterSpacing: -0.6,
          color: colors.text,
        }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}
export function DashboardOverview({
  events,
  loading,
  error,
  onRetry,
  onEvent,
  onNew,
  onPromotions,
  onEvents,
}: {
  events: DashboardEvent[];
  loading: boolean;
  error: boolean;
  onRetry(): void;
  onEvent(id: string): void;
  onNew(): void;
  onPromotions(): void;
  onEvents(filter: DashboardEventFilter): void;
}) {
  const { copy, language } = usePreferences(),
    { width } = useWindowDimensions(),
    wide = width >= 640;
  const now = useEventClock(selectDashboardEvent(events, Date.now()));
  const { upcoming, past: recent } = dashboardEventGroups(events, now);
  const featured = selectDashboardEvent(events, now);
  const live = featured ? isDashboardEventLive(featured, now) : false;
  const counts = dashboardTicketCounts(featured ?? {});
  const tiny = { fontSize: 12, lineHeight: 16, color: colors.muted } as const;
  function eventGroup(
    title: string,
    hint: string,
    items: DashboardEvent[],
    limit: number,
    filter: DashboardEventFilter,
  ) {
    return (
      <View
        testID={`dashboard-group-${filter}`}
        style={{
          borderTopWidth: 1,
          borderColor: "#ffffff1a",
          paddingTop: 24,
          gap: 16,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{ color: colors.text, fontSize: 18, fontWeight: "600" }}
            >
              {copy(title)}
            </Text>
            <Text style={{ ...tiny, fontSize: 14, lineHeight: 20 }}>
              {copy(hint)}
            </Text>
          </View>
          {items.length > limit && (
            <Pressable
              accessibilityRole="button"
              testID={`dashboard-see-all-${filter}`}
              onPress={() => onEvents(filter)}
            >
              <Text
                style={{
                  color: colors.accent,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {copy("common.seeAll")}
              </Text>
            </Pressable>
          )}
        </View>
        {loading ? (
          <Loading />
        ) : items.length ? (
          <Grid sm={2} gap={12}>
            {items.slice(0, limit).map((event) => (
              <DashboardMiniEvent
                key={event.id}
                event={event}
                onPress={() => onEvent(event.id)}
              />
            ))}
          </Grid>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: "#ffffff26",
              borderRadius: 8,
              padding: 20,
              gap: 12,
              flexDirection: wide ? "row" : "column",
              alignItems: wide ? "center" : "flex-start",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ ...tiny, fontSize: 14 }}>
              {copy(
                title === "dashboard.nextEvents"
                  ? "dashboard.noUpcomingEvents"
                  : "dashboard.noRecentEvents",
              )}
            </Text>
            {title === "dashboard.nextEvents" && (
              <Action
                title={copy("dashboard.addEvent")}
                icon={Plus}
                secondary
                onPress={onNew}
                style={{
                  minHeight: 36,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderColor: "#ff004459",
                  backgroundColor: "transparent",
                }}
                textStyle={{ fontSize: 12, color: colors.accent }}
              />
            )}
          </View>
        )}
      </View>
    );
  }
  return (
    <>
      <DashboardTitle
        title={copy("dashboard.account")}
        subtitle={copy("dashboard.overview")}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <Feedback title={copy("feedback.loadFailed")} retry={onRetry} />
      ) : (
        featured && (
          <Pressable
            testID="dashboard-featured-event"
            accessibilityRole="button"
            onPress={() => onEvent(featured.id)}
            style={{
              minHeight: 176,
              borderRadius: 12,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "#ffffff1a",
              backgroundColor: "#ffffff08",
            }}
          >
            <EventImage
              uri={featured.bannerUrl}
              style={{ position: "absolute", width: "100%", height: "100%" }}
            />
            <LinearGradient
              colors={["#000000", "#000000d9", "#00000073"]}
              locations={[0, 0.5, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                minHeight: 176,
                padding: wide ? 24 : 20,
                justifyContent: "flex-end",
              }}
            >
              <Text
                testID="dashboard-featured-status"
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 2.2,
                  textTransform: "uppercase",
                  color: colors.accent,
                }}
              >
                {copy(live ? "dashboard.liveEvent" : "dashboard.nextEvent")}
              </Text>
              <Text
                style={{
                  marginTop: 8,
                  fontSize: wide ? 24 : 20,
                  fontWeight: "700",
                  color: colors.text,
                }}
              >
                {featured.title}
              </Text>
              <View
                style={{
                  marginTop: 12,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  columnGap: 16,
                  rowGap: 4,
                }}
              >
                <View
                  style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
                >
                  <Calendar size={14} color={colors.accent} />
                  <Text style={{ fontSize: 14, color: "#ffffffbf" }}>
                    {formatDate(featured.startTime, language)}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 6,
                    alignItems: "center",
                    flexShrink: 1,
                  }}
                >
                  <MapPin size={14} color={colors.accent} />
                  <Text
                    style={{ fontSize: 14, color: "#ffffffbf", flexShrink: 1 }}
                  >
                    {featured.locationName}
                  </Text>
                </View>
              </View>
              {(counts.sold !== undefined || counts.scanned !== undefined) && (
                <View
                  style={{
                    marginTop: 16,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {(
                    [
                      {
                        key: "sold",
                        value: counts.sold,
                        label: "dashboard.ticketsSold",
                        Icon: Ticket,
                        color: colors.accent,
                      },
                      {
                        key: "scanned",
                        value: counts.scanned,
                        label: "dashboard.ticketsScanned",
                        Icon: ScanLine,
                        color: "#34d399",
                      },
                    ] as const
                  ).map(
                    ({ key, value, label, Icon, color }) =>
                      value !== undefined && (
                        <View
                          key={key}
                          testID={`dashboard-featured-${key}`}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 7,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: "#ffffff1a",
                            backgroundColor: "#00000080",
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                          }}
                        >
                          <Icon size={14} color={color} />
                          <Text
                            style={{
                              fontSize: 13,
                              lineHeight: 18,
                              color: "#ffffffbf",
                            }}
                          >
                            <Text
                              style={{ fontWeight: "700", color: "#ffffff" }}
                            >
                              {value.toLocaleString(language)}
                            </Text>{" "}
                            {copy(label)}
                          </Text>
                        </View>
                      ),
                  )}
                </View>
              )}
            </LinearGradient>
          </Pressable>
        )
      )}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Action
          title={copy("dashboardNav.newEvent")}
          icon={Plus}
          onPress={onNew}
          style={{ flex: 1, paddingHorizontal: 10 }}
        />
        <Action
          title={copy("dashboardNav.newPromotion")}
          icon={Megaphone}
          onPress={onPromotions}
          style={{ flex: 1, paddingHorizontal: 10, backgroundColor: "#ffffff" }}
          textStyle={{ color: colors.accent }}
        />
      </View>
      {eventGroup(
        "dashboard.nextEvents",
        "dashboard.nextEventsHint",
        upcoming,
        4,
        "upcoming",
      )}
      {eventGroup(
        "dashboard.recentEvents",
        "dashboard.recentEventsHint",
        recent,
        2,
        "completed",
      )}
    </>
  );
}

function DashboardMiniEvent({
  event,
  onPress,
}: {
  event: DashboardEvent;
  onPress(): void;
}) {
  const { language } = usePreferences();
  return (
    <Pressable
      testID="dashboard-mini-event"
      accessibilityRole="button"
      onPress={onPress}
      style={{
        flexDirection: "row",
        gap: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: "#ffffff1a",
        backgroundColor: "#ffffff08",
        padding: 12,
        alignItems: "center",
      }}
    >
      <EventImage
        uri={event.bannerUrl}
        style={{
          width: 56,
          height: 56,
          borderRadius: 6,
          backgroundColor: "#ffffff0d",
        }}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
        >
          {event.title}
        </Text>
        <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
          <Calendar size={12} color={colors.muted} />
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, color: colors.muted, flex: 1 }}
          >
            {formatDate(event.startTime, language, true)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
          <MapPin size={12} color={colors.muted} />
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, color: colors.muted, flex: 1 }}
          >
            {event.locationName}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
