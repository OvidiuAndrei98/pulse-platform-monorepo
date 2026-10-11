import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  ShieldCheck,
  WalletCards,
} from "lucide-react-native";
import { resources } from "../../../pulse-app/src/i18n/resources";
import { accountApi } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import { Feedback, Loading } from "../ui/common";
import { dColors, useAction } from "./common";
import { AGREEMENT_VERSION, type OrganizerProfile } from "./data";

const body = { fontSize: 14, lineHeight: 24, color: dColors.muted } as const;
const button = {
  height: 44,
  paddingHorizontal: 16,
  borderRadius: 8,
  flexDirection: "row",
  gap: 8,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.accent,
} as const;
function HomeLink({ onHome }: { onHome?: () => void }) {
  return (
    <Text
      accessibilityRole="link"
      onPress={onHome}
      style={{
        alignSelf: "flex-start",
        fontSize: 12,
        fontWeight: "600",
        color: colors.accent,
      }}
    >
      SPOTTR
    </Text>
  );
}
function DocumentHeader({
  eyebrow,
  title,
  intro,
  updatedAt,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updatedAt?: string;
}) {
  const { copy } = usePreferences(),
    wide = useWindowDimensions().width >= 640;
  return (
    <View
      style={{
        marginTop: 28,
        paddingBottom: updatedAt ? 28 : 32,
        borderBottomWidth: 1,
        borderBottomColor: "#ffffff1a",
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 1.98,
          color: colors.accent,
        }}
      >
        {eyebrow}
      </Text>
      <Text
        accessibilityRole="header"
        style={{
          marginTop: 8,
          fontSize: wide ? 36 : 30,
          lineHeight: wide ? 40 : 36,
          color: dColors.text,
          fontWeight: "600",
        }}
      >
        {title}
      </Text>
      <Text style={[body, { marginTop: 16, maxWidth: 672 }]}>{intro}</Text>
      {updatedAt && (
        <Text style={{ marginTop: 16, fontSize: 12, color: dColors.muted }}>
          {copy("legal.lastUpdated", { date: updatedAt })}
        </Text>
      )}
    </View>
  );
}

export function OrganizerStripeInformation({
  onAgreement,
  onHome,
}: {
  onAgreement(): void;
  onHome?: () => void;
}) {
  const { copy } = usePreferences(),
    wide = useWindowDimensions().width >= 640;
  const steps = [
    {
      icon: Building2,
      title: "stripeConnect.stepCompanyTitle",
      text: "stripeConnect.stepCompanyText",
    },
    {
      icon: CreditCard,
      title: "stripeConnect.stepStripeTitle",
      text: "stripeConnect.stepStripeText",
    },
    {
      icon: WalletCards,
      title: "stripeConnect.stepSalesTitle",
      text: "stripeConnect.stepSalesText",
    },
  ];
  return (
    <View testID="organizer-stripe-information">
      <HomeLink onHome={onHome} />
      <DocumentHeader
        eyebrow={copy("stripeConnect.eyebrow")}
        title={copy("stripeConnect.title")}
        intro={copy("stripeConnect.intro")}
      />
      <View
        testID="stripe-information-steps"
        style={{
          flexDirection: wide ? "row" : "column",
          gap: 1,
          borderWidth: 1,
          borderColor: "#ffffff1a",
          backgroundColor: "#ffffff1a",
          overflow: "hidden",
        }}
      >
        {steps.map(({ icon: Icon, title, text }) => (
          <View
            key={title}
            style={{
              flex: wide ? 1 : undefined,
              minWidth: 0,
              backgroundColor: "#101311",
              padding: 20,
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
              <Icon size={20} color={colors.accent} />
            </View>
            <Text
              style={{
                marginTop: 20,
                fontSize: 14,
                fontWeight: "600",
                color: dColors.text,
              }}
            >
              {copy(title)}
            </Text>
            <Text style={[body, { marginTop: 8 }]}>{copy(text)}</Text>
          </View>
        ))}
      </View>
      <View
        style={{
          marginTop: 32,
          borderWidth: 1,
          borderColor: "#ffffff1a",
          backgroundColor: "#ffffff08",
          padding: wide ? 24 : 20,
          flexDirection: "row",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <ShieldCheck size={20} color={colors.accent} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 16, fontWeight: "600", color: dColors.text }}
          >
            {copy("stripeConnect.organizerResponsibility")}
          </Text>
          <Text style={[body, { marginTop: 8 }]}>
            {copy("stripeConnect.organizerResponsibilityText")}
          </Text>
        </View>
      </View>
      <View
        style={{
          marginTop: 32,
          borderWidth: 1,
          borderColor: "#ff004440",
          backgroundColor: "#ff00440a",
          padding: 20,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: dColors.text }}>
          {copy("stripeConnect.beforeActivation")}
        </Text>
        <Text style={[body, { marginTop: 8 }]}>
          {copy("stripeConnect.beforeActivationText")}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onAgreement}
          style={[button, { marginTop: 16, alignSelf: "flex-start" }]}
        >
          <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>
            {copy("stripeConnect.viewAgreement")}
          </Text>
          <ArrowRight size={16} color="white" />
        </Pressable>
      </View>
    </View>
  );
}

export function OrganizerAgreement({
  profile,
  signedIn = true,
  onSignIn,
  loading = false,
  error = false,
  onRetry,
  onCompany,
  onAccepted,
  onHome,
}: {
  profile?: OrganizerProfile;
  signedIn?: boolean;
  onSignIn?: () => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onCompany?: () => void;
  onAccepted?: () => void;
  onHome?: () => void;
}) {
  const { language, copy } = usePreferences(),
    action = useAction(),
    wide = useWindowDimensions().width >= 640,
    [accepted, setAccepted] = useState(false),
    [saved, setSaved] = useState(false);
  // The original translated agreement and version remain the only source of legal copy.
  const document = resources[language].translation.legalDocuments.agreement;
  const current =
    saved || profile?.organizerAgreementVersion === AGREEMENT_VERSION;
  const accept = () => {
    if (!signedIn || !accepted || !profile) return;
    void action.run(
      () =>
        accountApi("/dashboard/organizer/agreement", {
          method: "POST",
          body: { version: AGREEMENT_VERSION },
        }),
      undefined,
      () => {
        setSaved(true);
        setAccepted(false);
        onAccepted?.();
      },
    );
  };
  return (
    <View testID="organizer-agreement">
      <HomeLink onHome={onHome} />
      <DocumentHeader
        eyebrow={document.eyebrow}
        title={document.title}
        intro={document.intro}
        updatedAt={document.updatedAt}
      />
      <View style={{ paddingVertical: 32, gap: 32 }}>
        {document.sections.map((section) => (
          <View key={section.title}>
            <Text
              style={{
                fontSize: 18,
                lineHeight: 28,
                fontWeight: "600",
                color: dColors.text,
              }}
            >
              {section.title}
            </Text>
            {"paragraphs" in section &&
              section.paragraphs.map((text) => (
                <Text key={text} style={[body, { marginTop: 12 }]}>
                  {text}
                </Text>
              ))}
            {"items" in section && (
              <View
                style={{
                  marginTop: 12,
                  gap: 8,
                  borderLeftWidth: 1,
                  borderLeftColor: "#ff00444d",
                  paddingLeft: 16,
                }}
              >
                {section.items.map((text) => (
                  <Text key={text} style={body}>
                    {text}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
      {!signedIn ? (
        <View
          testID="organizer-agreement-guest"
          style={{
            marginTop: 32,
            borderWidth: 1,
            borderColor: "#ff004440",
            backgroundColor: "#ff00440a",
            padding: 20,
          }}
        >
          <Text style={body}>{copy("agreement.signIn")}</Text>
          <Pressable
            testID="organizer-agreement-signin"
            accessibilityRole="button"
            onPress={onSignIn}
            style={[
              button,
              { marginTop: 16, height: 40, alignSelf: "flex-start" },
            ]}
          >
            <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>
              {copy("social.signIn")}
            </Text>
          </Pressable>
        </View>
      ) : loading ? (
        <Loading />
      ) : error ? (
        <Feedback title={copy("feedback.loadFailed")} retry={onRetry} />
      ) : (
        <View
          testID="organizer-agreement-acceptance"
          style={{
            marginTop: 32,
            borderWidth: 1,
            borderColor: "#ff004440",
            backgroundColor: "#ff00440a",
            padding: wide ? 24 : 20,
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
          >
            <CheckCircle2
              size={20}
              color={colors.accent}
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{ fontSize: 16, fontWeight: "600", color: dColors.text }}
              >
                {copy("agreement.title")}
              </Text>
              <Text style={[body, { marginTop: 4 }]}>
                {copy(
                  profile ? "agreement.hint" : "agreement.companyDetailsFirst",
                )}
              </Text>
            </View>
          </View>
          {profile && (
            <>
              <Pressable
                testID="organizer-agreement-checkbox"
                accessibilityRole="checkbox"
                accessibilityLabel={copy("agreement.confirm", {
                  version: AGREEMENT_VERSION,
                })}
                accessibilityState={{
                  checked: current || accepted,
                  disabled: current || action.busy,
                }}
                disabled={current || action.busy}
                onPress={() => setAccepted(!accepted)}
                style={{
                  marginTop: 20,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                  borderWidth: 1,
                  borderColor: "#ffffff1a",
                  backgroundColor: "#0000001a",
                  padding: 12,
                }}
              >
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    borderWidth: 1,
                    borderColor:
                      current || accepted ? colors.accent : "#ffffff40",
                    backgroundColor:
                      current || accepted ? colors.accent : "#ffffff08",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 4,
                  }}
                >
                  {(current || accepted) && <Check size={12} color="white" />}
                </View>
                <Text style={[body, { flex: 1 }]}>
                  {copy("agreement.confirm", { version: AGREEMENT_VERSION })}
                </Text>
              </Pressable>
              {action.feedback && (
                <View style={{ marginTop: 12 }}>{action.feedback}</View>
              )}
            </>
          )}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
              marginTop: profile ? 16 : 20,
            }}
          >
            {profile && !current && (
              <Pressable
                testID="organizer-agreement-submit"
                accessibilityRole="button"
                accessibilityState={{ disabled: !accepted || action.busy }}
                disabled={!accepted || action.busy}
                onPress={accept}
                style={[
                  button,
                  { opacity: !accepted || action.busy ? 0.5 : 1 },
                ]}
              >
                {action.busy && (
                  <ActivityIndicator size="small" color="white" />
                )}
                <Text
                  style={{ fontSize: 14, color: "white", fontWeight: "600" }}
                >
                  {copy("agreement.accept")}
                </Text>
              </Pressable>
            )}
            {onCompany && (
              <Pressable
                testID="organizer-agreement-company"
                accessibilityRole="button"
                onPress={onCompany}
                style={[
                  button,
                  profile && {
                    backgroundColor: "transparent",
                    borderWidth: 1,
                    borderColor: "#ffffff26",
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: dColors.text,
                    fontWeight: "600",
                  }}
                >
                  {copy("agreement.goToVerification")}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
