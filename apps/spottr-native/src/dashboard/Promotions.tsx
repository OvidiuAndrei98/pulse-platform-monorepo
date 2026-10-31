import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import {
  BarChart3,
  CalendarDays,
  Check,
  Eye,
  GalleryHorizontalEnd,
  Megaphone,
  MousePointerClick,
  Rows3,
  Sparkles,
} from "lucide-react-native";
import { Grid, SmallButton, Status, CheckRow, p } from "./managementUi";
import type { components } from "@packages/api-client/src/schema";
import { usePreferences } from "../usePreferences";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { Text } from "../ui/Text";
import { Feedback, Loading, useOpenLink } from "../ui/common";
import { Action, Field, Select, useDashboardQuery } from "./common";
import {
  promotionDates,
  type DashboardEvent,
  type Plan,
  type Campaign,
  type OrganizerProfile,
} from "./data";
import { useOrganizerFlow } from "./useOrganizerFlow";
import { isEventId } from "../data/events";
import {
  getPromotionBillingFieldErrors,
  isPromotionBucharestAddress,
  validatePromotionBillingDetails,
} from "../../../pulse-app/src/features/promotions/promotionBilling";
import { usePromotionBilling } from "./usePromotionBilling";
import { dColors as colors } from "./common";
export function Promotions({
  events,
  profile,
  profileLoading,
  profileError,
  onRetryProfile,
  returnCampaignId,
}: {
  events: DashboardEvent[];
  profile?: OrganizerProfile;
  profileLoading: boolean;
  profileError: boolean;
  onRetryProfile: () => void;
  returnCampaignId?: string;
}) {
  const { copy, language } = usePreferences(),
    { controller } = useAuth(),
    plans = useDashboardQuery<Plan[] | null>("/dashboard/promotions/plans"),
    campaigns = useDashboardQuery<Campaign[] | null>(
      "/dashboard/promotions",
      true,
      15000,
    ),
    action = useOrganizerFlow(),
    link = useOpenLink();
  useEffect(() => {
    if (isEventId(returnCampaignId))
      void action.refresh({ flow: "promotion", campaignId: returnCampaignId });
  }, [returnCampaignId]);
  const [placement, setPlacement] = useState<"home_banner" | "feed">(
      "home_banner",
    ),
    [planId, setPlanId] = useState("one_day"),
    [eventId, setEventId] = useState(""),
    [date, setDate] = useState(""),
    [attempted, setAttempted] = useState(false);
  const billingState = usePromotionBilling(profile),
    billing = billingState.details;
  const billingErrors = attempted
    ? getPromotionBillingFieldErrors(billing)
    : {};
  const bucharest = isPromotionBucharestAddress(billing);
  const eligible = events.filter(
      (event) =>
        event.status === "published" && Date.parse(event.endTime) > Date.now(),
    ),
    visible = (plans.data ?? []).filter((plan) => plan.placement === placement),
    plan = visible.find((p) => p.id === planId),
    event = eligible.find((e) => e.id === eventId),
    dates = useMemo(
      () => (plan && event ? promotionDates(plan, event.endTime) : []),
      [plan, event],
    );
  useEffect(() => {
    if (!eligible.some((e) => e.id === eventId))
      setEventId(eligible[0]?.id ?? "");
  }, [events, eventId]);
  useEffect(() => {
    if (!visible.some((p) => p.id === planId)) setPlanId(visible[0]?.id ?? "");
  }, [plans.data, placement, planId]);
  useEffect(() => {
    if (!dates.includes(date)) setDate(dates[0] ?? "");
  }, [dates, date]);
  const availability = useDashboardQuery<
    components["schemas"]["PromotionAvailabilityResponse"]
  >(
    `/dashboard/promotions/availability?plan=${encodeURIComponent(planId)}&startDate=${encodeURIComponent(date)}`,
    placement === "home_banner" && !!date && !!plan,
  );
  const checkout = () => {
    setAttempted(true);
    if (
      validatePromotionBillingDetails(billing) ||
      !plan ||
      !event ||
      !date ||
      !profile ||
      profile.verificationStatus !== "approved" ||
      profileError ||
      profileLoading ||
      billingState.loading
    )
      return;
    const token = controller.getToken();
    void action.start(async () => {
      await billingState.saveIfRequested();
      if (token !== controller.getToken()) throw new Error("SESSION_CHANGED");
      const result = await accountApi<{
        checkoutUrl: string;
        campaignId: string;
      }>("/dashboard/promotions/checkout", {
        method: "POST",
        body: {
          eventId: event.id,
          plan: plan.id,
          placement,
          startDate: date,
          billingDetails: billing,
          client: action.client,
        },
      });
      if (!isEventId(result.campaignId))
        throw new Error("INVALID_PROMOTION_CAMPAIGN");
      return {
        url: result.checkoutUrl,
        expected: { flow: "promotion", campaignId: result.campaignId },
      };
    });
  };
  const wide = useWindowDimensions().width >= 640,
    locale = language === "ro" ? "ro-RO" : "en-GB";
  return (
    <View testID="dashboard-promotions" style={{ gap: 28 }}>
      <View style={{ gap: 4 }}>
        <Text
          style={[
            p.title,
            { letterSpacing: -0.5 },
            wide && { fontSize: 30, lineHeight: 36 },
          ]}
        >
          {copy("promotions.title")}
        </Text>
        <Text style={p.muted}>{copy("promotions.subtitle")}</Text>
      </View>
      <View
        style={[
          p.panel,
          { borderRadius: 24, padding: wide ? 24 : 20, gap: 20 },
        ]}
      >
        <View style={p.row}>
          <Sparkles size={16} color={colors.accent} />
          <Text
            style={[
              p.tiny,
              {
                fontSize: 14,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              },
            ]}
          >
            {copy("promotions.settings")}
          </Text>
        </View>
        {plans.isPending ? (
          <Loading />
        ) : plans.isError ? (
          <Feedback
            title={copy("promotions.loadFailed")}
            retry={() => void plans.refetch()}
          />
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <Select
                label={copy("promotions.event")}
                value={eventId}
                icon={CalendarDays}
                placeholder={copy("promotions.chooseEvent")}
                options={eligible.map((event) => ({
                  value: event.id,
                  label: event.title,
                }))}
                onChange={setEventId}
                disabled={action.busy}
              />
              {!eligible.length && (
                <Text style={[p.tiny, { color: "#fcd34d" }]}>
                  {copy("promotions.noEligibleEvents")}
                </Text>
              )}
            </View>
            <View style={{ gap: 8 }}>
              <Text style={[p.tiny, { fontWeight: "600" }]}>
                {copy("promotions.placement")}
              </Text>
              <Grid sm={2}>
                {(["home_banner", "feed"] as const).map((value) => {
                  const active = value === placement,
                    Icon =
                      value === "home_banner" ? GalleryHorizontalEnd : Rows3;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: active,
                        disabled: action.busy,
                      }}
                      disabled={action.busy}
                      onPress={() => setPlacement(value)}
                      style={[
                        p.panel,
                        p.row,
                        {
                          flexGrow: 1,
                          alignItems: "flex-start",
                          gap: 12,
                          borderColor: active ? "#ff004480" : "#ffffff1a",
                          backgroundColor: active ? "#ff00441a" : "#00000026",
                        },
                      ]}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          justifyContent: "center",
                          alignItems: "center",
                          backgroundColor: active ? colors.accent : "#ffffff0d",
                        }}
                      >
                        <Icon
                          size={16}
                          color={active ? "white" : colors.muted}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={p.label}>
                          {copy(
                            value === "home_banner"
                              ? "promotions.bannerName"
                              : "promotions.feedName",
                          )}
                        </Text>
                        <Text style={p.tiny}>
                          {copy(
                            value === "home_banner"
                              ? "promotions.bannerDescription"
                              : "promotions.feedDescription",
                          )}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </Grid>
              {placement === "home_banner" && (
                <Text style={p.tiny}>
                  {copy("promotions.bannerReservationHint")}
                </Text>
              )}
            </View>
            <View style={{ gap: 8 }}>
              <Text style={[p.tiny, { fontWeight: "600" }]}>
                {copy("promotions.plan")}
              </Text>
              <Grid sm={3} testID="promotion-plan-grid">
                {visible.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: item.id === planId,
                      disabled: action.busy,
                    }}
                    disabled={action.busy}
                    onPress={() => setPlanId(item.id)}
                    style={[
                      p.panel,
                      {
                        flexGrow: 1,
                        borderColor:
                          item.id === planId ? "#ff004480" : "#ffffff1a",
                        backgroundColor:
                          item.id === planId ? "#ff00441a" : "#00000026",
                      },
                    ]}
                  >
                    {item.id === planId && (
                      <View
                        style={{
                          position: "absolute",
                          right: 12,
                          top: 12,
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: colors.accent,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Check size={12} color="white" />
                      </View>
                    )}
                    <Text style={[p.label, { paddingRight: 28 }]}>
                      {copy("promotions.plans." + item.id + ".name")}
                    </Text>
                    <Text style={[p.tiny, { marginTop: 4, minHeight: 40 }]}>
                      {copy("promotions.plans." + item.id + ".description")}
                    </Text>
                    <Text
                      style={{
                        marginTop: 12,
                        fontSize: 18,
                        fontWeight: "700",
                        color: colors.accent,
                      }}
                    >
                      {copy("promotions.amount", { amount: item.amountRon })}
                    </Text>
                  </Pressable>
                ))}
              </Grid>
            </View>
            <View style={{ gap: 8 }}>
              <Select
                label={copy("promotions.startDate")}
                value={date}
                placeholder={copy("promotions.chooseDate")}
                icon={CalendarDays}
                options={dates.map((value) => ({
                  value,
                  label: new Intl.DateTimeFormat(locale, {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(`${value}T12:00:00`)),
                }))}
                onChange={setDate}
                disabled={action.busy}
              />
              {event && !dates.length && (
                <Text style={[p.tiny, { color: "#fcd34d" }]}>
                  {copy("promotions.eventTooSoon")}
                </Text>
              )}
              {placement === "home_banner" &&
                !!date &&
                (availability.isError ? (
                  <Feedback
                    compact
                    title={copy("promotions.loadFailed")}
                    retry={() => void availability.refetch()}
                  />
                ) : (
                  <Text
                    style={[
                      p.tiny,
                      availability.data?.availableSlots === 0 && {
                        color: "#f87171",
                      },
                    ]}
                  >
                    {availability.isPending
                      ? copy("promotions.checkingAvailability")
                      : availability.data?.availableSlots === 0
                        ? copy("promotions.bannerSoldOut")
                        : copy("promotions.bannerSlotsAvailable", {
                            count: availability.data?.availableSlots ?? 0,
                            capacity: availability.data?.capacity ?? 5,
                          })}
                  </Text>
                ))}
            </View>
            <View style={[p.line, { paddingTop: 20, gap: 16 }]}>
              <View style={{ gap: 4 }}>
                <Text style={[p.tiny, { fontWeight: "600" }]}>
                  {copy("promotions.billing")}
                </Text>
                <Text style={p.tiny}>{copy("promotions.billingHint")}</Text>
              </View>
              {profileError ? (
                <Feedback
                  compact
                  title={copy("feedback.loadFailed")}
                  retry={onRetryProfile}
                />
              ) : profileLoading || billingState.loading ? (
                <Loading />
              ) : (
                <>
                  {billingState.saved && (
                    <Grid sm={2} gap={8}>
                      {(["saved", "new"] as const).map((source) => (
                        <Pressable
                          key={source}
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: billingState.source === source,
                            disabled: action.busy,
                          }}
                          disabled={action.busy}
                          onPress={() => {
                            billingState.choose(source);
                            setAttempted(false);
                          }}
                          style={[
                            p.panel,
                            {
                              padding: 14,
                              borderRadius: 12,
                              flexGrow: 1,
                              borderColor:
                                billingState.source === source
                                  ? "#ff0044b3"
                                  : "#ffffff1a",
                              backgroundColor:
                                billingState.source === source
                                  ? "#ff00441a"
                                  : "#ffffff05",
                              gap: 4,
                            },
                          ]}
                        >
                          <Text style={p.label}>
                            {copy(
                              source === "saved"
                                ? "checkout.useSavedBilling"
                                : "checkout.useOtherBilling",
                            )}
                          </Text>
                          {source === "saved" && (
                            <Text style={[p.tiny, { color: "#ffffff8c" }]}>
                              {billingState.saved!.address},{" "}
                              {billingState.saved!.city}
                            </Text>
                          )}
                        </Pressable>
                      ))}
                    </Grid>
                  )}
                  {(billingState.source === "new" || !billingState.saved) && (
                    <>
                      <View
                        style={[
                          p.panel,
                          {
                            padding: 14,
                            borderRadius: 12,
                            gap: 12,
                            backgroundColor: "#ffffff05",
                          },
                        ]}
                      >
                        {(["registrationNumber", "address"] as const).map(
                          (key) => (
                            <Field
                              key={key}
                              label={copy(
                                key === "registrationNumber"
                                  ? "checkout.registrationNumber"
                                  : "checkout.billingAddress",
                              )}
                              value={billing[key]}
                              onChange={(value) =>
                                billingState.change({
                                  ...billing,
                                  [key]: value,
                                })
                              }
                              error={
                                billingErrors[key]
                                  ? copy(billingErrors[key]!)
                                  : undefined
                              }
                              disabled={action.busy}
                              inputStyle={{
                                borderRadius: 12,
                                backgroundColor: "#ffffff09",
                              }}
                            />
                          ),
                        )}
                        <Grid sm={2} gap={12}>
                          <Field
                            label={copy("checkout.billingCity")}
                            value={billing.city}
                            onChange={(city) =>
                              billingState.change({ ...billing, city })
                            }
                            error={
                              billingErrors.city
                                ? copy(billingErrors.city)
                                : undefined
                            }
                            disabled={action.busy}
                            inputStyle={{
                              borderRadius: 12,
                              backgroundColor: "#ffffff09",
                            }}
                          />
                          {bucharest ? (
                            <Select
                              label={copy("checkout.billingSector")}
                              placeholder={copy("checkout.sectorPlaceholder")}
                              value={billing.sector}
                              options={Array.from(
                                { length: 6 },
                                (_, index) => ({
                                  value: `Sector ${index + 1}`,
                                  label: `Sector ${index + 1}`,
                                }),
                              )}
                              onChange={(sector) =>
                                billingState.change({
                                  ...billing,
                                  sector,
                                  county: "Bucuresti",
                                })
                              }
                              disabled={action.busy}
                              error={
                                billingErrors.sector
                                  ? copy(billingErrors.sector)
                                  : undefined
                              }
                            />
                          ) : (
                            <Field
                              label={copy("checkout.billingCounty")}
                              value={billing.county}
                              onChange={(county) =>
                                billingState.change({ ...billing, county })
                              }
                              error={
                                billingErrors.county
                                  ? copy(billingErrors.county)
                                  : undefined
                              }
                              disabled={action.busy}
                              inputStyle={{
                                borderRadius: 12,
                                backgroundColor: "#ffffff09",
                              }}
                            />
                          )}
                        </Grid>
                        {bucharest && (
                          <Text style={[p.tiny, { color: "#ffffff73" }]}>
                            {copy("checkout.bucharestAddressHint")}
                          </Text>
                        )}
                        <Field
                          label={copy("checkout.billingCountry")}
                          value={billing.country}
                          onChange={(country) =>
                            billingState.change({ ...billing, country })
                          }
                          error={
                            billingErrors.country
                              ? copy(billingErrors.country)
                              : undefined
                          }
                          disabled={action.busy}
                          inputStyle={{
                            borderRadius: 12,
                            backgroundColor: "#ffffff09",
                          }}
                        />
                      </View>
                      <CheckRow
                        plain
                        label={copy(
                          billingState.saved
                            ? "checkout.replaceSavedBilling"
                            : "checkout.rememberBilling",
                        )}
                        hint={copy("checkout.rememberBillingHint")}
                        checked={billingState.remember}
                        onChange={billingState.setRemember}
                        disabled={action.busy}
                      />
                    </>
                  )}
                </>
              )}
              {billingState.error && (
                <Feedback
                  compact
                  title={copy(billingState.error)}
                  retry={
                    billingState.error === "checkout.billingLoadFailed"
                      ? billingState.retry
                      : undefined
                  }
                />
              )}
            </View>
            {action.feedback}
            <View
              style={[
                p.line,
                {
                  paddingTop: 20,
                  flexDirection: wide ? "row" : "column",
                  alignItems: wide ? "center" : "stretch",
                  justifyContent: "space-between",
                  gap: 12,
                },
              ]}
            >
              <View>
                <Text style={p.tiny}>{copy("promotions.singlePayment")}</Text>
                <Text
                  style={{
                    marginTop: 4,
                    color: colors.text,
                    fontWeight: "700",
                    fontSize: 20,
                  }}
                >
                  {copy("promotions.amount", { amount: plan?.amountRon ?? 0 })}
                </Text>
              </View>
              <Action
                title={copy("promotions.payAndPromote")}
                icon={Megaphone}
                disabled={
                  action.busy ||
                  billingState.loading ||
                  profileLoading ||
                  profileError ||
                  !profile ||
                  profile.verificationStatus !== "approved" ||
                  !date ||
                  !event ||
                  !plan ||
                  (placement === "home_banner" &&
                    (availability.isPending ||
                      availability.isError ||
                      !availability.data?.availableSlots))
                }
                onPress={checkout}
                style={{
                  minHeight: 48,
                  borderRadius: 999,
                  paddingHorizontal: 24,
                }}
              />
            </View>
          </>
        )}
      </View>
      <View style={{ gap: 16 }}>
        <View style={p.row}>
          <BarChart3 size={20} color={colors.accent} />
          <Text style={p.sectionTitle}>{copy("promotions.statistics")}</Text>
        </View>
        {campaigns.isPending ? (
          <Loading />
        ) : campaigns.isError ? (
          <Feedback
            title={copy("promotions.loadFailed")}
            retry={() => void campaigns.refetch()}
          />
        ) : !campaigns.data?.length ? (
          <View style={[p.empty, { borderRadius: 16, padding: 32 }]}>
            <Text style={[p.muted, { textAlign: "center" }]}>
              {copy("promotions.noCampaigns")}
            </Text>
          </View>
        ) : (
          [...campaigns.data]
            .sort(
              (a, b) =>
                Number(b.status === "active") - Number(a.status === "active"),
            )
            .map((campaign) => (
              <View
                key={campaign.id}
                style={[p.panel, { padding: wide ? 20 : 16, gap: 12 }]}
              >
                <View
                  style={[
                    p.row,
                    {
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    },
                  ]}
                >
                  <View style={{ gap: 4, flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 10,
                        color: colors.accent,
                        fontWeight: "600",
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      {copy(
                        campaign.placement === "feed"
                          ? "promotions.feedName"
                          : "promotions.bannerName",
                      )}
                    </Text>
                    <Text style={p.label}>{campaign.eventTitle}</Text>
                    <Text style={p.tiny}>
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                      }).format(new Date(campaign.startsAt))}{" "}
                      –{" "}
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: "medium",
                      }).format(new Date(campaign.endsAt))}
                    </Text>
                  </View>
                  <Status
                    label={copy("promotions.status." + campaign.status)}
                    tone={
                      campaign.status === "active"
                        ? "green"
                        : campaign.status === "scheduled"
                          ? "amber"
                          : "muted"
                    }
                  />
                </View>
                <Grid columns={3} gap={8}>
                  {[
                    {
                      key: "impressions",
                      value: String(campaign.impressionsCount),
                      Icon: Eye,
                    },
                    {
                      key: "clicks",
                      value: String(campaign.clicksCount),
                      Icon: MousePointerClick,
                    },
                    {
                      key: "CTR",
                      value: `${Number(campaign.ctr).toFixed(1)}%`,
                      Icon: BarChart3,
                    },
                  ].map(({ key, value, Icon }) => (
                    <View
                      key={key}
                      style={{
                        borderRadius: 12,
                        backgroundColor: "#00000033",
                        padding: 12,
                      }}
                    >
                      <Icon size={14} color={colors.accent} />
                      <Text
                        style={{
                          marginTop: 8,
                          color: colors.text,
                          fontSize: 18,
                          fontWeight: "700",
                        }}
                      >
                        {value}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[p.tiny, { fontSize: 10, marginTop: 2 }]}
                      >
                        {key === "CTR" ? key : copy("promotions." + key)}
                      </Text>
                    </View>
                  ))}
                </Grid>
                <Text style={[p.tiny, { textAlign: "right" }]}>
                  {copy("promotions.paymentSummary", {
                    amount: campaign.amountRon,
                  })}
                </Text>
                {campaign.status === "pending_payment" && (
                  <SmallButton
                    title={copy("feedback.retry")}
                    disabled={action.busy}
                    onPress={() =>
                      void action.refresh({
                        flow: "promotion",
                        campaignId: campaign.id,
                      })
                    }
                  />
                )}
                {campaign.invoiceStatus && (
                  <View
                    style={[
                      p.line,
                      p.row,
                      {
                        paddingTop: 12,
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                      },
                    ]}
                  >
                    <Text style={p.tiny}>
                      {copy("promotions.invoiceStatusLabel")}:{" "}
                      {copy(
                        "promotions.invoiceStatus." + campaign.invoiceStatus,
                      )}
                    </Text>
                    {campaign.invoiceDocumentUrl && (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() =>
                          void link.open(campaign.invoiceDocumentUrl!)
                        }
                      >
                        <Text
                          style={[
                            p.tiny,
                            { color: colors.accent, fontWeight: "600" },
                          ]}
                        >
                          {copy("promotions.openInvoice")}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
                {campaign.attentionRequired && (
                  <View style={[p.warning, { borderRadius: 12, gap: 4 }]}>
                    <Text
                      style={[p.tiny, { color: "#fef3c7", fontWeight: "600" }]}
                    >
                      {copy("promotions.invoiceAttentionTitle")}
                    </Text>
                    <Text style={[p.tiny, { color: "#fef3c7" }]}>
                      {copy("promotions.invoiceAttention")}
                    </Text>
                    {(campaign.invoiceRefundedRon ?? 0) > 0 && (
                      <Text style={[p.tiny, { color: "#fef3c7" }]}>
                        {copy("promotions.refundedAmount", {
                          amount: campaign.invoiceRefundedRon ?? 0,
                        })}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))
        )}
      </View>
      {link.error && (
        <Text style={{ color: colors.danger }}>
          {copy("feedback.loadFailed")}
        </Text>
      )}
    </View>
  );
}
