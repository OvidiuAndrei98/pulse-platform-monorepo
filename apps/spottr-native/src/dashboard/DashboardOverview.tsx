import React, { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  Building2,
  Calendar,
  CreditCard,
  MapPin,
  Megaphone,
  Plus,
  RefreshCw,
  Unplug,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { accountApi } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { EventImage, Feedback, Loading } from "../ui/common";
import { formatDate } from "../data/events";
import { Action, Confirm, dColors as colors, s, useAction } from "./common";
import {
  AGREEMENT_VERSION,
  type DashboardEvent,
  type OrganizerProfile,
} from "./data";
import { Grid } from "./managementUi";
import { useOrganizerFlow } from "./useOrganizerFlow";

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
  profile,
  loading,
  error,
  onRetry,
  onEvent,
  onNew,
  onCompany,
  onAgreement,
  onStripeInfo,
  onPromotions,
  onEvents,
  returning,
}: {
  events: DashboardEvent[];
  profile?: OrganizerProfile;
  loading: boolean;
  error: boolean;
  onRetry(): void;
  onEvent(id: string): void;
  onNew(): void;
  onCompany(): void;
  onAgreement(): void;
  onStripeInfo(): void;
  onPromotions(): void;
  onEvents(): void;
  returning?: boolean;
}) {
  const { copy, language } = usePreferences(),
    { width } = useWindowDimensions(),
    action = useAction(),
    flow = useOrganizerFlow();
  const [disconnect, setDisconnect] = useState(false),
    wide = width >= 640;
  useEffect(() => {
    if (returning) void flow.refresh({ flow: "connect" });
  }, [returning]);
  const now = Date.now(),
    upcoming = events
      .filter((e) => Date.parse(e.startTime) > now)
      .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)),
    recent = events
      .filter((e) => Date.parse(e.startTime) <= now)
      .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime));
  const companyReady = profile?.verificationStatus === "approved",
    stripeReady = !!(
      profile?.stripeChargesEnabled && profile.stripePayoutsEnabled
    ),
    agreementCurrent = profile?.organizerAgreementVersion === AGREEMENT_VERSION;
  const tiny = { fontSize: 12, lineHeight: 16, color: colors.muted } as const;
  const connect = () =>
    void flow.start(async () => {
      const result = await accountApi<{ url: string }>(
        `/dashboard/stripe/account-link?client=${flow.client}`,
        { method: "POST" },
      );
      return { url: result.url, expected: { flow: "connect" } };
    });
  function eventGroup(
    title: string,
    hint: string,
    items: DashboardEvent[],
    limit: number,
  ) {
    return (
      <View
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
          <Pressable onPress={onEvents}>
            <Text
              style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}
            >
              {copy("common.seeAll")}
            </Text>
          </Pressable>
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
        upcoming[0] && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onEvent(upcoming[0]!.id)}
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
              uri={upcoming[0].bannerUrl}
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
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 2.2,
                  textTransform: "uppercase",
                  color: colors.accent,
                }}
              >
                {copy("dashboard.nextEvent")}
              </Text>
              <Text
                style={{
                  marginTop: 8,
                  fontSize: wide ? 24 : 20,
                  fontWeight: "700",
                  color: colors.text,
                }}
              >
                {upcoming[0].title}
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
                    {formatDate(upcoming[0].startTime, language)}
                  </Text>
                </View>
                <View
                  style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
                >
                  <MapPin size={14} color={colors.accent} />
                  <Text style={{ fontSize: 14, color: "#ffffffbf" }}>
                    {upcoming[0].locationName}
                  </Text>
                </View>
              </View>
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
      {!loading && !error && (
        <View
          style={{
            borderWidth: 1,
            borderColor: companyReady ? "#ffffff1a" : "#fbbf2433",
            backgroundColor: companyReady ? "#ffffff08" : "#fbbf240a",
            borderRadius: 12,
            padding: 20,
            gap: 16,
            flexDirection: wide ? "row" : "column",
            alignItems: wide ? "center" : undefined,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              flex: wide ? 1 : undefined,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                backgroundColor: companyReady
                  ? stripeReady
                    ? "#ff004426"
                    : "#ffffff0d"
                  : "#fbbf241a",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {companyReady ? (
                <CreditCard
                  size={20}
                  color={stripeReady ? colors.accent : colors.muted}
                />
              ) : (
                <Building2 size={20} color="#fcd34d" />
              )}
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: colors.text }}
              >
                {copy(
                  companyReady
                    ? "dashboard.stripePayments"
                    : profile?.verificationStatus === "pending"
                      ? "organizerProfile.companyPending"
                      : profile?.verificationStatus === "rejected"
                        ? "organizerProfile.companyRejected"
                        : "dashboard.companyMissing",
                )}
              </Text>
              <Text style={tiny}>
                {copy(
                  !companyReady
                    ? profile?.verificationStatus === "pending"
                      ? "dashboard.companyPendingHint"
                      : profile?.verificationStatus === "rejected"
                        ? "dashboard.companyRejectedHint"
                        : "dashboard.companyRequired"
                    : !agreementCurrent
                      ? "dashboard.acceptAgreementBeforeStripe"
                      : stripeReady
                        ? "dashboard.paymentsActive"
                        : "dashboard.connectStripeToSell",
                )}
              </Text>
              {companyReady && !stripeReady && (
                <Pressable onPress={onStripeInfo}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: colors.accent,
                      marginTop: 4,
                    }}
                  >
                    {copy("dashboard.stripeExplainer")}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
          {!companyReady ? (
            <Action
              title={copy("organizerProfile.configureCompany")}
              onPress={onCompany}
              style={{
                minHeight: 40,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
              textStyle={{ fontSize: 12 }}
            />
          ) : (
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                flexShrink: 1,
              }}
            >
              {!agreementCurrent && (
                <Action
                  title={copy("dashboard.acceptAgreement")}
                  secondary
                  onPress={onAgreement}
                  style={{
                    minHeight: 40,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderColor: "#ff004459",
                  }}
                  textStyle={{ fontSize: 12, color: colors.accent }}
                />
              )}
              {profile?.stripeAccountId && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy("dashboard.refreshStripe")}
                  disabled={flow.busy || action.busy}
                  onPress={() => void flow.refresh({ flow: "connect" })}
                  style={{
                    height: 40,
                    width: 40,
                    borderWidth: 1,
                    borderColor: "#ffffff26",
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <RefreshCw size={16} color={colors.text} />
                </Pressable>
              )}
              {agreementCurrent && !stripeReady && (
                <Action
                  title={copy(
                    profile?.stripeAccountId
                      ? "dashboard.continueStripe"
                      : "dashboard.connectStripe",
                  )}
                  icon={CreditCard}
                  disabled={flow.busy || action.busy}
                  onPress={connect}
                  style={{
                    minHeight: 40,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  }}
                  textStyle={{ fontSize: 12 }}
                />
              )}
              {profile?.stripeAccountId && (
                <Action
                  title={copy("dashboard.disconnectStripe")}
                  icon={Unplug}
                  secondary
                  danger
                  disabled={flow.busy || action.busy}
                  onPress={() => setDisconnect(true)}
                  style={{
                    minHeight: 40,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: "transparent",
                  }}
                  textStyle={{ fontSize: 12 }}
                />
              )}
            </View>
          )}
        </View>
      )}
      {action.feedback}
      {flow.feedback}
      {eventGroup(
        "dashboard.nextEvents",
        "dashboard.nextEventsHint",
        upcoming,
        4,
      )}
      {eventGroup(
        "dashboard.recentEvents",
        "dashboard.recentEventsHint",
        recent,
        2,
      )}
      {disconnect && (
        <Confirm
          title={copy("dashboard.disconnectStripeTitle")}
          detail={copy("dashboard.disconnectStripeHint")}
          busy={action.busy}
          onClose={() => setDisconnect(false)}
          onConfirm={() =>
            void action.run(
              () =>
                accountApi("/dashboard/stripe/account", { method: "DELETE" }),
              "dashboard.stripeDisconnected",
              () => setDisconnect(false),
            )
          }
        />
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
            {formatDate(event.startTime, language)}
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
