import React, { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@packages/api-client/src/schema";
import {
  ArrowUpRight,
  Building2,
  Calendar,
  Camera,
  Check,
  ChevronRight,
  Globe2,
  KeyRound,
  MapPin,
  QrCode,
  Receipt,
  Ticket,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { EventImage, Feedback, Loading } from "../ui/common";
import { formatDate } from "../data/events";
import { useTickets } from "../data/useTickets";
import { TicketAvailability } from '../profile/TicketAvailability';
import {
  TicketSheet,
  ticketStatus,
  type UserTicket,
} from "../profile/TicketSheet";
import { uploadProfileAvatar } from "../profile/avatar";
import { formatRon } from "../../../pulse-app/src/features/events/serviceFee";
import { Action, Field, dColors as colors, useAction } from "./common";
import type { OrganizerProfile } from "./data";
import { Grid } from "./managementUi";
import { DashboardTitle } from "./DashboardOverview";

export function DashboardProfile({
  profile,
  loading,
  error,
  retry,
  onCompany,
}: {
  profile?: OrganizerProfile;
  loading: boolean;
  error: boolean;
  retry(): void;
  onCompany(): void;
}) {
  const auth = useAuth(),
    { copy, language, setLanguage } = usePreferences(),
    { width } = useWindowDimensions();
  const edit = useAction(),
    avatar = useAction(),
    password = useAction(),
    lang = useAction();
  const [name, setName] = useState(auth.user?.username ?? ""),
    [bio, setBio] = useState(auth.user?.bio ?? ""),
    [attempted, setAttempted] = useState(false),
    [sent, setSent] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    setName(auth.user?.username ?? "");
    setBio(auth.user?.bio ?? "");
  }, [auth.user?.id, auth.user?.username, auth.user?.bio]);
  useEffect(() => {
    setSaved(false);
    setSent(false);
    setAttempted(false);
  }, [auth.user?.id]);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(timer);
  }, [saved]);
  const compact = width < 640,
    columns = width >= 768,
    companyReady = profile?.verificationStatus === "approved";
  const smallLabel = {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.55,
    textTransform: "uppercase",
    color: colors.muted,
  } as const;
  const section = (
    title: string,
    Icon: LucideIcon,
    children: React.ReactNode,
  ) => (
    <View
      style={{
        flexGrow: 1,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "#ffffff1a",
        backgroundColor: "#ffffff0d",
        padding: 24,
        gap: 20,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          alignItems: "center",
          borderBottomWidth: 1,
          borderColor: "#ffffff0d",
          paddingBottom: 8,
        }}
      >
        <Icon size={16} color={colors.accent} />
        <Text
          style={{
            color: colors.text,
            fontSize: 14,
            fontWeight: "600",
            letterSpacing: 0.35,
          }}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
  return (
    <>
      <DashboardTitle
        title={copy("organizerProfile.title")}
        subtitle={copy("organizerProfile.subtitle")}
      />
      <View
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: "#ffffff1a",
          backgroundColor: "#ffffff0d",
          padding: 24,
          gap: 20,
          flexDirection: compact ? "column" : "row",
          alignItems: compact ? "flex-start" : "center",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy("profile.changeAvatar")}
          disabled={avatar.busy}
          onPress={() =>
            void avatar.run(() => uploadProfileAvatar(auth.controller))
          }
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 2,
            borderColor: "#ff004466",
            backgroundColor: "#ffffff0d",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {auth.user?.avatarUrl ? (
            <EventImage
              uri={auth.user.avatarUrl}
              style={{ width: 60, height: 60, borderRadius: 30 }}
            />
          ) : (
            <UserRound size={32} color={colors.muted} />
          )}
          <View
            style={{
              position: "absolute",
              bottom: -1,
              right: -1,
              width: 28,
              height: 28,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#000",
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Camera size={14} color="#fff" />
          </View>
        </Pressable>
        <View style={{ flex: compact ? undefined : 1, gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
            {auth.user?.username || copy("organizerProfile.userFallback")}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {auth.user?.email}
          </Text>
          {avatar.feedback}
        </View>
      </View>
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#ffffff1a",
          backgroundColor: "#ffffff08",
          padding: 20,
          gap: 16,
          flexDirection: compact ? "column" : "row",
          alignItems: compact ? undefined : "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            flex: compact ? undefined : 1,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              backgroundColor: companyReady ? "#ff004426" : "#fbbf241a",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Building2
              size={20}
              color={companyReady ? colors.accent : "#fcd34d"}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            {loading ? (
              <Loading />
            ) : (
              <>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.text,
                  }}
                >
                  {profile?.companyName || copy("dashboard.companyMissing")}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: companyReady ? colors.accent : colors.muted,
                  }}
                >
                  {copy(
                    companyReady
                      ? "dashboard.companyVerified"
                      : profile?.verificationStatus === "pending"
                        ? "organizerProfile.companyPending"
                        : profile?.verificationStatus === "rejected"
                          ? "organizerProfile.companyRejected"
                          : "dashboard.companyRequired",
                    { cui: profile?.cui ?? "" },
                  )}
                </Text>
              </>
            )}
          </View>
        </View>
        {!loading && !companyReady && (
          <Action
            secondary
            icon={ArrowUpRight}
            title={copy("organizerProfile.configureCompany")}
            onPress={onCompany}
            style={{
              minHeight: 40,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderColor: "#ff004459",
            }}
            textStyle={{ fontSize: 12, color: colors.accent }}
          />
        )}
      </View>
      {error && (
        <Feedback compact title={copy("feedback.loadFailed")} retry={retry} />
      )}
      <Grid md={2} gap={24}>
        {section(
          copy("organizerProfile.publicDetails"),
          UserRound,
          <View style={{ gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={smallLabel}>{copy("profile.displayName")}</Text>
              <Field
                hideLabel
                label={copy("profile.displayName")}
                value={name}
                onChange={(value) => {
                  setName(value);
                  setSaved(false);
                }}
                maxLength={50}
                inputStyle={{
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  backgroundColor: "#ffffff0d",
                }}
                error={
                  attempted && name.trim().length < 3
                    ? copy("profile.displayNameTooShort")
                    : undefined
                }
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={smallLabel}>{copy("profile.bio")}</Text>
              <Field
                hideLabel
                label={copy("profile.bio")}
                value={bio}
                onChange={setBio}
                maxLength={500}
                multiline
                placeholder={copy("profile.bioPlaceholder")}
                inputStyle={{
                  borderRadius: 12,
                  padding: 14,
                  backgroundColor: "#ffffff0d",
                  minHeight: 90,
                }}
              />
            </View>
            {edit.feedback}
            <Action
              title={copy(
                edit.busy
                  ? "profile.saving"
                  : saved
                    ? "profile.saved"
                    : "profile.saveChanges",
              )}
              icon={saved ? Check : undefined}
              disabled={edit.busy}
              onPress={() => {
                setAttempted(true);
                if (name.trim().length < 3) return;
                void edit.run(
                  () =>
                    auth.controller.update({
                      username: name.trim(),
                      bio: bio.trim(),
                    }),
                  "profile.updateSuccess",
                  () => setSaved(true),
                );
              }}
              style={{
                minHeight: 40,
                paddingVertical: 10,
                borderRadius: 12,
                alignSelf: compact ? "stretch" : "flex-start",
              }}
              textStyle={{ fontSize: 12, fontWeight: "700" }}
            />
          </View>,
        )}
        {section(
          copy("organizerProfile.passwordSecurity"),
          KeyRound,
          <View style={{ gap: 16 }}>
            <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 19 }}>
              {copy("profile.resetHint", {
                email: auth.user?.email || copy("profile.yourAccount"),
              })}
            </Text>
            {password.feedback}
            <Action
              title={copy(
                password.busy
                  ? "profile.sending"
                  : sent
                    ? "profile.linkSent"
                    : "profile.resetPassword",
              )}
              icon={sent ? Check : undefined}
              disabled={!auth.user?.email || password.busy || sent}
              onPress={() =>
                void password.run(
                  () =>
                    accountApi("/auth/forgot-password", {
                      method: "POST",
                      body: { email: auth.user?.email },
                      token: null,
                    }),
                  undefined,
                  () => setSent(true),
                )
              }
              style={{
                minHeight: 40,
                paddingVertical: 10,
                borderRadius: 12,
                alignSelf: compact ? "stretch" : "flex-start",
              }}
              textStyle={{ fontSize: 12, fontWeight: "700" }}
            />
          </View>,
        )}
        {section(
          copy("profile.language"),
          UserRound,
          <>
            <Pressable
              accessibilityRole="button"
              disabled={lang.busy}
              onPress={() => {
                const next = language === "ro" ? "en" : "ro";
                void lang.run(
                  () => auth.controller.update({ preferredLanguage: next }),
                  undefined,
                  (value) => {
                    if (value) setLanguage(next);
                  },
                );
              }}
              style={{
                marginHorizontal: -8,
                marginVertical: -8,
                borderWidth: 1,
                borderColor: "#ffffff1a",
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 14,
                flexDirection: "row",
                gap: 12,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "#ffffff0f",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Globe2 size={16} color={colors.muted} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.text,
                  }}
                >
                  {copy("profile.language")}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {copy(
                    language === "ro" ? "profile.romanian" : "profile.english",
                  )}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.muted} />
            </Pressable>
            {lang.feedback}
          </>,
        )}
      </Grid>
    </>
  );
}

export function DashboardPurchases() {
  const [tab, setTab] = useState<"tickets" | "orders">("tickets"),
    [ticket, setTicket] = useState<UserTicket | null>(null);
  const { user } = useAuth(),
    { copy, language } = usePreferences(),
    { width } = useWindowDimensions(),
    tickets = useTickets(true, !!ticket);
  const orders = useQuery({
    queryKey: ["dashboard-purchases-orders", user?.id],
    enabled: !!user,
    queryFn: async ({ signal }) => {
      const value = await accountApi<
        components["schemas"]["UserOrderResponse"][] | null
      >("/users/me/orders", { signal });
      if (value === null) return [];
      if (
        !Array.isArray(value) ||
        value.some(
          (row) =>
            !row ||
            typeof row.id !== "string" ||
            typeof row.eventTitle !== "string" ||
            !Number.isFinite(row.paidTotalBani) ||
            !Number.isFinite(Date.parse(row.createdAt)),
        )
      )
        throw new Error("Invalid orders");
      return value;
    },
  });
  const empty = (Icon: LucideIcon, title: string, hint: string) => (
    <View
      style={{
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: "#ffffff26",
        paddingHorizontal: 20,
        paddingVertical: 48,
        alignItems: "center",
        gap: 4,
      }}
    >
      <Icon size={24} color={colors.accent} />
      <Text
        style={{
          marginTop: 8,
          fontSize: 14,
          fontWeight: "600",
          color: colors.text,
        }}
      >
        {copy(title)}
      </Text>
      <Text style={{ fontSize: 12, textAlign: "center", color: colors.muted }}>
        {copy(hint)}
      </Text>
    </View>
  );
  return (
    <>
      <DashboardTitle
        title={copy("purchases.title")}
        subtitle={copy("purchases.subtitle")}
      />
      <View
        style={{
          flexDirection: "row",
          height: 44,
          width: "100%",
          maxWidth: 384,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#ffffff1a",
          backgroundColor: "#ffffff09",
          padding: 4,
        }}
      >
        {(["tickets", "orders"] as const).map((value) => {
          const Icon = value === "tickets" ? Ticket : Receipt;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === value }}
              onPress={() => setTab(value)}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 8,
                backgroundColor: tab === value ? colors.accent : "transparent",
              }}
            >
              <Icon size={14} color={tab === value ? "#fff" : colors.muted} />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: tab === value ? "#fff" : colors.muted,
                }}
              >
                {copy(
                  value === "tickets"
                    ? "purchases.tickets"
                    : "purchases.invoices",
                )}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: tab === value ? "#ffffffcc" : colors.muted,
                }}
              >
                {value === "tickets"
                  ? (tickets.data?.length ?? 0)
                  : (orders.data?.length ?? 0)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {tab === 'tickets' && <TicketAvailability offline={tickets.offline} savedAt={tickets.savedAt} storageError={tickets.storageError} refreshing={tickets.isFetching} onRefresh={() => void tickets.refetch()} />}
      {(tab === "tickets" ? tickets : orders).isPending ? (
        <Loading />
      ) : (tab === "tickets" ? tickets : orders).isError ? (
        <Feedback
          title={copy("feedback.loadFailed")}
          retry={() => {
            void (tab === "tickets" ? tickets : orders).refetch();
          }}
        />
      ) : tab === "tickets" ? (
        tickets.data?.length ? (
          <View style={{ gap: 12 }}>
            {tickets.data.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => setTicket(item)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#ffffff1a",
                  backgroundColor: "#ffffff06",
                  padding: 16,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor:
                      ticketStatus(item) === "active"
                        ? "#ff00444d"
                        : "#ffffff1a",
                    backgroundColor:
                      ticketStatus(item) === "active"
                        ? "#ff00441a"
                        : "#ffffff0a",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ticket
                    size={16}
                    color={
                      ticketStatus(item) === "active"
                        ? colors.accent
                        : colors.muted
                    }
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.text,
                    }}
                  >
                    {item.eventTitle}
                  </Text>
                  <Metadata
                    date={formatDate(item.startTime, language, false, {
                      year: true,
                    })}
                    location={item.locationName}
                  />
                </View>
                {width >= 640 && (
                  <View style={{ gap: 4, alignItems: "flex-end" }}>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: colors.text,
                      }}
                    >
                      {item.ticketTypeName}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {copy("purchases." + ticketStatus(item))}
                    </Text>
                  </View>
                )}
                <QrCode size={16} color={colors.accent} />
              </Pressable>
            ))}
          </View>
        ) : (
          empty(Ticket, "purchases.noTickets", "purchases.noTicketsHint")
        )
      ) : orders.data?.length ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: "#ffffff1a",
            borderRadius: 8,
            overflow: "hidden",
            backgroundColor: "#ffffff06",
          }}
        >
          {orders.data.map((order, i) => (
            <View
              key={order.id}
              style={{
                flexDirection: "row",
                gap: 12,
                padding: 16,
                borderBottomWidth: i === orders.data.length - 1 ? 0 : 1,
                borderColor: "#ffffff1a",
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  backgroundColor: "#ff00441a",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Receipt size={16} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.text,
                  }}
                >
                  {order.eventTitle}
                </Text>
                <Metadata
                  date={formatDate(order.createdAt, language, false, {
                    year: true,
                  })}
                  location={order.locationName}
                />
                <Text style={{ fontSize: 10, color: colors.muted }}>
                  {copy("purchases.order", { id: order.id })}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", maxWidth: "40%", gap: 4 }}>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: colors.text,
                  }}
                >
                  {formatRon(order.paidTotalBani / 100)}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {["completed", "pending", "canceled", "refunded"].includes(
                    order.status,
                  )
                    ? copy("orders." + order.status)
                    : order.status}
                </Text>
                {order.refundedAmountBani > 0 && (
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: colors.accent,
                    }}
                  >
                    {copy("orders.refundedAmount", {
                      amount: formatRon(order.refundedAmountBani / 100),
                    })}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      ) : (
        empty(Receipt, "purchases.noOrders", "purchases.noOrdersHint")
      )}
      {ticket && (
        <TicketSheet
          tickets={(tickets.data ?? []).filter(item => item.eventId === ticket.eventId)}
          preferUnused={false}
          offline={tickets.offline}
          savedAt={tickets.savedAt}
          initialId={ticket.id}
          onClose={() => setTicket(null)}
        />
      )}
    </>
  );
}
function Metadata({ date, location }: { date: string; location: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        columnGap: 12,
        rowGap: 4,
      }}
    >
      <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
        <Calendar size={14} color={colors.muted} />
        <Text style={{ fontSize: 12, color: colors.muted }}>{date}</Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          gap: 4,
          alignItems: "center",
          flexShrink: 1,
        }}
      >
        <MapPin size={14} color={colors.muted} />
        <Text
          numberOfLines={1}
          style={{ fontSize: 12, color: colors.muted, flexShrink: 1 }}
        >
          {location}
        </Text>
      </View>
    </View>
  );
}
