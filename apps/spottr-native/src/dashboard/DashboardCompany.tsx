import { AccentPressable } from '../ui/AccentPressable';
﻿import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { Check, CheckCircle2, ShieldCheck } from "lucide-react-native";
import { usePreferences } from "../usePreferences";
import { accountApi } from "../auth/AuthProvider";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import { Feedback, Loading } from "../ui/common";
import { Field, dColors, useAction } from "./common";
import { AGREEMENT_VERSION, type OrganizerProfile } from "./data";

export function Company({
  profile,
  onAgreement,
  loading = false,
  error = false,
  onRetry,
}: {
  profile?: OrganizerProfile;
  onAgreement(): void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const { copy } = usePreferences(),
    wide = useWindowDimensions().width >= 640,
    action = useAction();
  const [cui, setCui] = useState(profile?.cui ?? ""),
    [name, setName] = useState(profile?.companyName ?? ""),
    [agreement, setAgreement] = useState(false),
    [retrying, setRetrying] = useState(false),
    [submitted, setSubmitted] = useState<OrganizerProfile>(),
    [notice, setNotice] = useState("");
  const dirty = useRef(false),
    current = submitted ?? profile;
  useEffect(() => {
    if (profile && !dirty.current) {
      setCui(profile.cui);
      setName(profile.companyName);
    }
  }, [profile]);
  useEffect(() => setSubmitted(undefined), [profile]);
  const submit = () => {
    if (!agreement || !cui.trim() || !name.trim()) return;
    setNotice("");
    void action.run(
      () =>
        accountApi<OrganizerProfile>("/dashboard/organizer/profile", {
          method: "POST",
          body: {
            cui: cui.trim(),
            companyName: name.trim(),
            organizerAgreementVersion: AGREEMENT_VERSION,
          },
        }),
      undefined,
      (updated) => {
        setSubmitted(updated);
        setRetrying(false);
        dirty.current = false;
        setNotice(
          copy(
            updated.verificationStatus === "approved"
              ? "validation.companyApproved"
              : "validation.companySubmitted",
          ),
        );
      },
    );
  };
  if (loading) return <Loading />;
  if (error)
    return <Feedback title={copy("feedback.loadFailed")} retry={onRetry} />;
  if (current?.isVerified && current.verificationStatus === "approved")
    return (
      <View
        testID="company-verified"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#ff004440",
          backgroundColor: "#ff00440a",
          padding: 20,
        }}
      >
        <CheckCircle2 size={20} color={colors.accent} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{ fontSize: 14, fontWeight: "600", color: dColors.text }}
          >
            {current.companyName}
          </Text>
          <Text style={{ fontSize: 12, color: dColors.muted }}>
            {copy("validation.verifiedCompany", { cui: current.cui })}
          </Text>
          {!!notice && (
            <Text
              accessibilityLiveRegion="polite"
              style={{ fontSize: 14, color: colors.accent }}
            >
              {notice}
            </Text>
          )}
        </View>
      </View>
    );
  return (
    <View
      testID="company-verification"
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#fbbf2440",
        backgroundColor: "#fbbf240a",
        padding: wide ? 24 : 20,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
        <ShieldCheck size={20} color="#fcd34d" style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: wide ? 24 : 20,
              lineHeight: wide ? 32 : 28,
              fontWeight: "600",
              color: dColors.text,
            }}
          >
            {copy("validation.companyVerification")}
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 14,
              lineHeight: 24,
              color: dColors.muted,
            }}
          >
            {copy("validation.companyHint")}
          </Text>
        </View>
      </View>
      {current?.verificationStatus === "pending" && !retrying ? (
        <View
          testID="company-pending"
          style={{
            marginTop: 20,
            flexDirection: wide ? "row" : "column",
            alignItems: wide ? "center" : "stretch",
            gap: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#fcd34d33",
            backgroundColor: "#fcd34d0f",
          }}
        >
          <Text
            style={{
              flex: wide ? 1 : undefined,
              fontSize: 14,
              lineHeight: 20,
              color: "#fde68a",
            }}
          >
            {copy("validation.companyPending")}
          </Text>
          <Pressable
            testID="company-retry"
            accessibilityRole="button"
            onPress={() => {
              setCui(current.cui);
              setName(current.companyName);
              setRetrying(true);
              setNotice("");
              action.clear();
            }}
            style={{
              height: 36,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#fcd34d4d",
            }}
          >
            <Text style={{ color: "#fef3c7", fontSize: 12, fontWeight: "600" }}>
              {copy("validation.verifyAgain")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ marginTop: 24, gap: 12 }}>
          <View style={{ flexDirection: wide ? "row" : "column", gap: 12 }}>
            <Field
              testID="company-cui"
              hideLabel
              label={copy("validation.cui")}
              placeholder={copy("validation.cui")}
              value={cui}
              onChange={(value) => {
                dirty.current = true;
                setCui(value);
              }}
              disabled={action.busy}
              style={wide ? { flex: 1 } : undefined}
              inputStyle={{
                height: 44,
                minHeight: 44,
                borderRadius: 8,
                borderColor: "#ffffff26",
                backgroundColor: "#00000033",
                paddingHorizontal: 12,
              }}
            />
            <Field
              testID="company-name"
              hideLabel
              label={copy("validation.companyName")}
              placeholder={copy("validation.companyName")}
              value={name}
              onChange={(value) => {
                dirty.current = true;
                setName(value);
              }}
              disabled={action.busy}
              style={wide ? { flex: 1.4 } : undefined}
              inputStyle={{
                height: 44,
                minHeight: 44,
                borderRadius: 8,
                borderColor: "#ffffff26",
                backgroundColor: "#00000033",
                paddingHorizontal: 12,
              }}
            />
            <AccentPressable fallback={Pressable}
              testID="company-submit"
              accessibilityRole="button"
              accessibilityState={{
                disabled:
                  action.busy || !agreement || !cui.trim() || !name.trim(),
              }}
              disabled={
                action.busy || !agreement || !cui.trim() || !name.trim()
              }
              onPress={submit}
              style={{
                height: 44,
                paddingHorizontal: 16,
                borderRadius: 8,
                flexDirection: "row",
                gap: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.accent,
                opacity:
                  action.busy || !agreement || !cui.trim() || !name.trim()
                    ? 0.5
                    : 1,
              }}
            >
              {action.busy && <ActivityIndicator size="small" color="white" />}
              <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>
                {copy("validation.verify")}
              </Text>
            </AccentPressable>
          </View>
          <Pressable
            testID="company-agreement"
            accessibilityRole="checkbox"
            accessibilityLabel={`${copy("validation.agreementPrefix")} ${copy("validation.agreementLink")}`}
            accessibilityState={{ checked: agreement, disabled: action.busy }}
            disabled={action.busy}
            onPress={() => setAgreement(!agreement)}
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              borderRadius: 8,
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
                marginTop: 2,
                borderRadius: 3,
                borderWidth: 1,
                borderColor: agreement ? colors.accent : "#ffffff40",
                backgroundColor: agreement ? colors.accent : "#ffffff08",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {agreement && <Check size={12} color="white" />}
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 12,
                lineHeight: 20,
                color: dColors.muted,
              }}
            >
              {copy("validation.agreementPrefix")}{" "}
              <Text
                accessibilityRole="link"
                onPress={(event) => {
                  event.stopPropagation();
                  onAgreement();
                }}
                style={{ color: colors.accent, fontWeight: "600" }}
              >
                {copy("validation.agreementLink")}
              </Text>
              {copy("validation.agreementSuffix")}
            </Text>
          </Pressable>
        </View>
      )}
      {action.feedback && (
        <View style={{ marginTop: 16 }}>{action.feedback}</View>
      )}
      {!!notice && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ marginTop: 16, fontSize: 14, color: colors.accent }}
        >
          {notice}
        </Text>
      )}
    </View>
  );
}
