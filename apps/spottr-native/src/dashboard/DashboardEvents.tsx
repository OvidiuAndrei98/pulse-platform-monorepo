import type { ScrollViewInstance } from 'react-native';
import { FormInput as TextInput } from "../ui/FormInput";
import React, { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Calendar,
  Clock3,
  Euro,
  Heart,
  MapPin,
  Plus,
  Search,
  Ticket,
  UsersRound,
} from "lucide-react-native";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { EventImage, Feedback, Loading } from "../ui/common";
import { formatDate } from "../data/events";
import { Action, dColors as colors } from "./common";
import type { DashboardEvent } from "./data";
import { DashboardTitle } from "./DashboardOverview";
import {
  dashboardEventFilters,
  filterDashboardEvents,
  type DashboardEventFilter,
} from "../../../pulse-app/src/features/events/dashboardEvents";
import { useEventClock } from "../data/useEventClock";
import { selectDashboardEvent } from "../../../pulse-app/src/features/events/dashboardFeatured";

export function DashboardEvents({
  events,
  loading,
  error,
  retry,
  onEvent,
  onNew,
  filter,
  onFilterChange,
}: {
  events: DashboardEvent[];
  loading: boolean;
  error: boolean;
  retry(): void;
  onEvent(id: string): void;
  onNew(): void;
  filter: DashboardEventFilter;
  onFilterChange(filter: DashboardEventFilter): void;
}) {
  const { copy, language } = usePreferences(),
    { width } = useWindowDimensions(),
    small = width < 640,
    large = width >= 1024;
  const [q, setQ] = useState("");
  const filterStrip = useRef<ScrollViewInstance>(null);
  const now = useEventClock(selectDashboardEvent(events, Date.now()));
  const filtered = filterDashboardEvents(events, filter, q, now);
  return (
    <>
      <View
        style={{
          flexDirection: small ? "column" : "row",
          alignItems: small ? undefined : "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <View style={{ flex: small ? undefined : 1 }}>
          <DashboardTitle
            title={copy("organizerEvents.title")}
            subtitle={copy("organizerEvents.total", {
              total: events.length,
              published: events.filter((e) => e.status === "published").length,
            })}
          />
        </View>
        <Action
          title={copy("organizerEvents.newEvent")}
          icon={Plus}
          onPress={onNew}
          style={{ borderRadius: 6 }}
          textStyle={{ fontSize: 12, fontWeight: "700" }}
        />
      </View>
      <View
        style={{
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <View
          style={{
            height: 44,
            width: "100%",
            borderRadius: 99,
            borderWidth: 1,
            borderColor: "#ffffff1a",
            backgroundColor: "#ffffff0d",
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            gap: 10,
          }}
        >
          <Search size={16} color={colors.muted} />
          <TextInput
            variant="bare"
            accessibilityLabel={copy("organizerEvents.searchPlaceholder")}
            value={q}
            onChangeText={setQ}
            placeholder={copy("organizerEvents.searchPlaceholder")}
            placeholderTextColor="#9ca89e80"
            style={[
              {
                flex: 1,
                color: colors.text,
                fontSize: small ? 12 : 14,
                height: 42,
              },
              Platform.OS === "web" && ({ outlineStyle: "none" } as never),
            ]}
          />
        </View>
        <ScrollView
          ref={filterStrip}
          horizontal
          showsHorizontalScrollIndicator={false}
          testID="dashboard-event-filters"
          contentContainerStyle={{ padding: 4, gap: 2 }}
          style={{
            flexDirection: "row",
            height: 44,
            width: "100%",
            maxWidth: "100%",
            flexGrow: 0,
            borderRadius: 99,
            borderWidth: 1,
            borderColor: "#ffffff1a",
            backgroundColor: "#ffffff0d",
          }}
        >
          {dashboardEventFilters.map((value) => (
            <Pressable
              key={value}
              testID={`dashboard-filter-${value}`}
              onLayout={(event) => {
                if (filter === value)
                  filterStrip.current?.scrollTo({
                    x: Math.max(0, event.nativeEvent.layout.x - 12),
                    animated: false,
                  });
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === value }}
              aria-selected={filter === value}
              onPress={() => onFilterChange(value)}
              style={{
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 99,
                backgroundColor:
                  filter === value ? colors.accent : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: filter === value ? "#ffffff" : colors.muted,
                }}
              >
                {copy("organizerEvents." + value)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {loading ? (
        <Loading />
      ) : error ? (
        <Feedback title={copy("organizerEvents.loadFailed")} retry={retry} />
      ) : !filtered.length ? (
        <View
          style={{
            padding: 32,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "#ffffff1a",
            backgroundColor: "#ffffff0d",
          }}
        >
          <Text
            style={{
              color: colors.muted,
              textAlign: "center",
              fontSize: small ? 12 : 14,
            }}
          >
            {copy("organizerEvents.noMatch")}
          </Text>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {filtered.map((e) => {
            const sold =
                e.stats?.totalTicketsSold ??
                (e.ticketTypes ?? []).reduce(
                  (sum, t) => sum + (t.ticketsSold ?? 0),
                  0,
                ),
              capacity = (e.ticketTypes ?? []).reduce(
                (sum, t) => sum + t.capacity,
                0,
              ),
              revenue =
                e.stats?.totalRevenueRon ??
                (e.ticketTypes ?? []).reduce(
                  (sum, t) => sum + t.priceRon * (t.ticketsSold ?? 0),
                  0,
                ),
              fill =
                capacity > 0
                  ? Math.min(100, Math.round((sold / capacity) * 100))
                  : 0;
            const interested = e.stats?.interestedCount ?? 0,
              attendance =
                sold +
                Math.max(
                  0,
                  (e.stats?.goingCount ?? 0) -
                    (e.stats?.ticketHolderCount ?? 0),
                );
            const status =
              e.status === "completed" || Date.parse(e.endTime) <= Date.now()
                ? "organizerEvents.completed"
                : ["cancel_pending", "refunding", "cancelled"].includes(
                      e.status,
                    )
                  ? `eventCancellation.eventStatus.${e.status}`
                  : `organizerEvents.${e.status === "published" || e.status === "scheduled" ? e.status : "draft"}`;
            const audience = (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    columnGap: 12,
                    rowGap: 6,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    <UsersRound size={14} color={colors.accent} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: large ? colors.text : colors.muted,
                      }}
                    >
                      {copy("organizerEvents.going", { count: attendance })}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 4,
                      alignItems: "center",
                    }}
                  >
                    <Heart size={14} color={colors.accent} />
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {copy("organizerEvents.interested", {
                        count: interested,
                      })}
                    </Text>
                  </View>
                </View>
                <Text
                  style={{ fontSize: large ? 10 : 11, color: colors.muted }}
                >
                  {copy("organizerEvents.estimate", {
                    min: attendance + Math.round(interested * 0.15),
                    max: attendance + Math.round(interested * 0.2),
                  })}
                </Text>
              </>
            );
            return (
              <Pressable
                key={e.id}
                testID={`dashboard-event-${e.id}`}
                accessibilityRole="button"
                onPress={() => onEvent(e.id)}
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: "#ffffff1a",
                  backgroundColor: "#ffffff0d",
                  padding: small ? 16 : 20,
                  gap: large ? 20 : 16,
                  flexDirection: large ? "row" : "column",
                  alignItems: large ? "center" : undefined,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: small ? 14 : 16,
                    flex: large ? 1 : undefined,
                    minWidth: 0,
                  }}
                >
                  <EventImage
                    uri={e.bannerUrl}
                    style={{
                      width: small ? 64 : 80,
                      height: small ? 64 : 80,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "#ffffff1a",
                    }}
                  />
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      paddingTop: 2,
                      gap: small ? 4 : 6,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          borderRadius: 6,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          fontSize: 10,
                          fontWeight: "700",
                          letterSpacing: 0.6,
                          textTransform: "uppercase",
                          color:
                            e.status === "published"
                              ? colors.accent
                              : e.status === "scheduled"
                                ? "#fcd34d"
                                : colors.muted,
                          backgroundColor:
                            e.status === "published"
                              ? "#ff004426"
                              : e.status === "scheduled"
                                ? "#fbbf2426"
                                : "#ffffff1a",
                        }}
                      >
                        {copy(status)}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          letterSpacing: 0.5,
                          color: colors.muted,
                        }}
                      >
                        {e.category}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: small ? 16 : 18,
                        fontWeight: "700",
                        color: colors.text,
                      }}
                    >
                      {e.title}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        columnGap: 12,
                        rowGap: 4,
                        paddingTop: 2,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <Calendar size={14} color={colors.accent} />
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          {formatDate(e.startTime, language, true)}
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
                          numberOfLines={1}
                          style={{
                            fontSize: 12,
                            color: colors.muted,
                            flexShrink: 1,
                          }}
                        >
                          {e.locationName}
                        </Text>
                      </View>
                    </View>
                    {e.status === "scheduled" && e.publishAt && (
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <Clock3 size={14} color="#fcd34d" />
                        <Text style={{ fontSize: 11, color: "#fcd34d" }}>
                          {copy("organizerEvents.publishesAt", {
                            date: new Date(e.publishAt).toLocaleString(
                              language,
                            ),
                          })}
                        </Text>
                      </View>
                    )}
                    {!large && (
                      <View
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTopWidth: 1,
                          borderColor: "#ffffff1a",
                          gap: 4,
                        }}
                      >
                        {audience}
                      </View>
                    )}
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    gap: small ? 10 : 12,
                    width: large ? 280 : undefined,
                    borderTopWidth: large ? 0 : 1,
                    borderColor: "#ffffff1a",
                    paddingTop: large ? 0 : 16,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: "#ffffff1a",
                      borderRadius: 8,
                      backgroundColor: "#0000001a",
                      padding: 12,
                      gap: 8,
                      justifyContent: "space-between",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 4,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <Ticket size={12} color={colors.accent} />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: "700",
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                            color: colors.muted,
                          }}
                        >
                          {copy("organizerEvents.tickets")}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          color: colors.muted,
                        }}
                      >
                        {fill}%
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: small ? 12 : 14,
                        fontWeight: "700",
                        color: colors.text,
                      }}
                    >
                      {sold}
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "400",
                          color: colors.muted,
                        }}
                      >
                        {" "}
                        / {capacity}
                      </Text>
                    </Text>
                    <View
                      style={{
                        height: 4,
                        borderRadius: 99,
                        backgroundColor: "#ffffff1a",
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: 4,
                          width: `${fill}%`,
                          backgroundColor: colors.accent,
                        }}
                      />
                    </View>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: "#ffffff1a",
                      borderRadius: 8,
                      backgroundColor: "#0000001a",
                      padding: 12,
                      gap: 8,
                      justifyContent: "space-between",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      <Euro size={12} color={colors.accent} />
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "700",
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          color: colors.muted,
                        }}
                      >
                        {copy("organizerEvents.revenue")}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: small ? 12 : 14,
                        fontWeight: "700",
                        color: colors.accent,
                      }}
                    >
                      {revenue.toLocaleString(
                        language === "ro" ? "ro-RO" : "en-GB",
                      )}{" "}
                      RON
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: 9, color: colors.muted }}
                    >
                      {copy("organizerEvents.totalCollected")}
                    </Text>
                  </View>
                </View>
                {large && (
                  <View
                    style={{
                      flex: 0.72,
                      minWidth: 150,
                      borderLeftWidth: 1,
                      borderColor: "#ffffff1a",
                      paddingLeft: 20,
                      gap: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "700",
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        color: "#9ca89eb3",
                      }}
                    >
                      {copy("organizerEvents.audience")}
                    </Text>
                    {audience}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );
}
