import React, { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Building2, CreditCard, RefreshCw, Unplug } from "lucide-react-native";
import { accountApi } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import { Text } from "../ui/Text";
import { Feedback, Loading } from "../ui/common";
import { Action, Confirm, dColors as colors, useAction } from "./common";
import { AGREEMENT_VERSION, type OrganizerProfile } from "./data";
import { useOrganizerFlow } from "./useOrganizerFlow";

export function StripeAccountPanel({
  profile,
  loading,
  error,
  onRetry,
  onCompany,
  onAgreement,
  onStripeInfo,
  returning,
}: {
  profile?: OrganizerProfile;
  loading: boolean;
  error: boolean;
  onRetry(): void;
  onCompany(): void;
  onAgreement(): void;
  onStripeInfo(): void;
  returning?: boolean;
}) {
  const { copy } = usePreferences(),
    { width } = useWindowDimensions(),
    action = useAction(),
    flow = useOrganizerFlow();
  const [disconnect, setDisconnect] = useState(false),
    wide = width >= 640;
  useEffect(() => {
    if (returning) void flow.refresh({ flow: "connect" });
  }, [returning]);
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

  return (
    <View testID="stripe-account-panel" style={{ gap: 16 }}>
      {loading ? (
        <Loading />
      ) : error ? (
        <Feedback title={copy("feedback.loadFailed")} retry={onRetry} />
      ) : null}
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
    </View>
  );
}
