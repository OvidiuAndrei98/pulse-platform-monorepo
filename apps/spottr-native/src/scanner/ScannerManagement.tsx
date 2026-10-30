import { FormInput as TextInput } from '../ui/FormInput';
import React, { useEffect, useRef, useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Copy,
  Link2,
  MailPlus,
  Trash2,
  UserRoundCheck,
  UsersRound,
} from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../usePreferences";
import { Feedback, Loading } from "../ui/common";
import { Text } from "../ui/Text";
import { Action, dColors as colors } from "../dashboard/common";
import { Grid, SmallButton } from "../dashboard/managementUi";
import { formatDate } from "../data/events";
import type { ValidationEvent } from "./data";
import { scannerApi } from "./runtime";
import { s } from "./ScannerPanel";
import { DateTimeField } from "../dashboard/DateTimeField";
import { formatToDatetimeLocal } from "../../../pulse-app/src/features/events/form/dateTimeValues";

export function ScannerManagement({
  event,
  token,
  section,
}: {
  event: ValidationEvent;
  token: string;
  section: "team" | "links";
}) {
  const { copy, language } = usePreferences(),
    { controller, user } = useAuth(),
    { width } = useWindowDimensions(),
    [email, setEmail] = useState(""),
    [label, setLabel] = useState("Gate 1"),
    [start, setStart] = useState(formatToDatetimeLocal(event.startTime)),
    [end, setEnd] = useState(formatToDatetimeLocal(event.endTime)),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [createdLabel, setCreatedLabel] = useState("");
  const locked = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const staff = useQuery({
    queryKey: ["scanner-staff", event.id, user?.id],
    queryFn: () => scannerApi.staff(event.id, token),
    retry: false,
  });
  const accesses = useQuery({
    queryKey: ["scanner-accesses", event.id, user?.id],
    queryFn: () => scannerApi.accesses(event.id, token),
    retry: false,
  });
  const action = async (work: () => Promise<void>, failure: string) => {
    if (locked.current || controller.getToken() !== token) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch {
      if (alive.current) setError(copy(failure));
    } finally {
      if (alive.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  const current = () => alive.current && controller.getToken() === token;
  const list = {
    borderWidth: 1,
    borderColor: "#ffffff1a",
    borderRadius: 8,
    marginTop: 16,
    overflow: "hidden",
  } as const;
  return (
    <View testID="scanner-management" style={{ gap: 24 }}>
      {error ? (
        <Text style={s.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {notice ? (
        <Text
          style={[s.muted, { color: colors.accent }]}
          accessibilityLiveRegion="polite"
        >
          {notice}
        </Text>
      ) : null}
      <View testID="scanner-team-section" style={[s.panel, { padding: width >= 640 ? 24 : 20 }, section !== "team" && {display:"none"}]}>
        <View style={[s.row, { alignItems: "flex-start", gap: 12 }]}>
          <UsersRound
            size={20}
            color={colors.accent}
            style={{ marginTop: 2 }}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.heading}>{copy("validation.validationTeam")}</Text>
            <Text style={s.muted}>
              {copy("validation.staffHint", { event: event.title })}
            </Text>
          </View>
        </View>
        <View
          style={{
            marginTop: 20,
            flexDirection: width >= 640 ? "row" : "column",
            gap: 8,
          }}
        >
          <TextInput
            testID="scanner-staff-email"
            value={email}
            onChangeText={setEmail}
            accessibilityLabel={copy("validation.staffEmailPlaceholder")}
            placeholder={copy("validation.staffEmailPlaceholder")}
            placeholderTextColor={colors.muted}
            maxLength={254}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
            style={[s.input, width >= 640 && { flex: 1, minWidth: 0 }]}
          />
          <Action
            title={copy("validation.addAccess")}
            icon={MailPlus}
            style={s.accentButton}
            textStyle={{ color: colors.accent }}
            disabled={busy || !email.trim()}
            onPress={() => {
              void action(async () => {
                await scannerApi.addStaff(event.id, email, token);
                if (!current()) return;
                setEmail("");
                setNotice(copy("validation.staffAdded"));
                await staff.refetch();
              }, "validation.staffAddFailed");
            }}
          />
        </View>
        <View testID="scanner-staff-list" style={list}>
          {staff.isPending ? (
            <Loading />
          ) : staff.isError ? (
            <Feedback
              compact
              title={copy("validation.staffLoadFailed")}
              retry={() => {
                void staff.refetch();
              }}
            />
          ) : !staff.data.length ? (
            <Text
              style={[s.muted, { paddingHorizontal: 12, paddingVertical: 16 }]}
            >
              {copy("validation.onlyYou")}
            </Text>
          ) : (
            staff.data.map((person, index) => (
              <View
                key={person.id}
                style={[
                  s.row,
                  {
                    gap: 12,
                    padding: 12,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: "#ffffff1a",
                  },
                ]}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: "#ff00441a",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <UserRoundCheck size={16} color={colors.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={[s.heading, { fontSize: 14, lineHeight: 20 }]}
                  >
                    {person.username}
                  </Text>
                  <Text numberOfLines={1} style={s.tiny}>
                    {person.email}
                  </Text>
                </View>
                <SmallButton
                  icon={Trash2}
                  disabled={busy}
                  label={copy("validation.removeAccess", {
                    name: person.username,
                  })}
                  onPress={() => {
                    void action(async () => {
                      await scannerApi.removeStaff(event.id, person.id, token);
                      if (!current()) return;
                      setNotice(copy("validation.staffRemoved"));
                      await staff.refetch();
                    }, "validation.staffRemoveFailed");
                  }}
                />
              </View>
            ))
          )}
        </View>
      </View>
      <View testID="scanner-links-section" style={[s.panel, { padding: width >= 640 ? 24 : 20 }, section !== "links" && {display:"none"}]}>
        <View style={[s.row, { alignItems: "flex-start", gap: 12 }]}>
          <Link2 size={20} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.heading}>{copy("validation.quickAccess")}</Text>
            <Text style={s.muted}>
              {copy("validation.quickAccessHint", { event: event.title })}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 20, gap: 12 }}>
          <Grid md={2}>
            <TextInput
              value={label}
              onChangeText={setLabel}
              accessibilityLabel={copy("validation.scannerLabelPlaceholder")}
              placeholder={copy("validation.scannerLabelPlaceholder")}
              placeholderTextColor={colors.muted}
              maxLength={80}
              autoCapitalize="none"
              editable={!busy}
              style={s.input}
            />
          </Grid>
          <Grid md={2}>
            <DateTimeField
              variant="scanner"
              label={copy("validation.activeFrom")}
              value={start}
              onChange={setStart}
              disabled={busy}
            />
            <DateTimeField
              variant="scanner"
              label={copy("validation.activeUntil")}
              value={end}
              onChange={setEnd}
              disabled={busy}
            />
          </Grid>
          <Action
            title={copy("validation.createLink")}
            icon={Link2}
            style={[
              s.accentButton,
              width >= 768 && { alignSelf: "flex-start" },
            ]}
            textStyle={{ color: colors.accent }}
            disabled={busy || !label.trim() || !start || !end}
            onPress={() => {
              void action(async () => {
                const response = await scannerApi.createAccess(
                  event,
                  label,
                  start,
                  end,
                  token,
                );
                if (!current()) return;
                const parsed = new URL(response.url);
                if (!["https:", "http:"].includes(parsed.protocol))
                  throw new Error("INVALID_URL");
                setUrl(parsed.toString());
                setCreatedLabel(label.trim());
                setNotice(copy("validation.linkCreated"));
                await accesses.refetch();
              }, "validation.linkCreateFailed");
            }}
          />
        </View>
        {url ? (
          <View
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#ff00444d",
              backgroundColor: "#ff004412",
            }}
          >
            <View style={[s.row, { justifyContent: "space-between", gap: 12 }]}>
              <Text style={[s.heading, { fontSize: 14, flex: 1 }]}>
                {createdLabel}
              </Text>
              <SmallButton
                primary
                icon={Copy}
                title={copy("validation.copy")}
                disabled={busy}
                onPress={() => {
                  void action(async () => {
                    // Expo's legacy web fallback reports success even when
                    // execCommand('copy') returns false. Respect the browser's
                    // actual result; use the native module on iOS/Android.
                    if (Platform.OS === "web")
                      await navigator.clipboard.writeText(url);
                    else if (!(await Clipboard.setStringAsync(url)))
                      throw new Error("CLIPBOARD_WRITE_FAILED");
                    if (current()) setNotice(copy("validation.linkCopied"));
                  }, "validation.linkCopyFailed");
                }}
              />
            </View>
            <Text
              selectable
              style={[
                s.tiny,
                {
                  marginTop: 8,
                  fontSize: 11,
                  fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                },
              ]}
            >
              {url}
            </Text>
          </View>
        ) : null}
        <View testID="scanner-access-list" style={list}>
          {accesses.isPending ? (
            <Loading />
          ) : accesses.isError ? (
            <Feedback
              compact
              title={copy("validation.linksLoadFailed")}
              retry={() => {
                void accesses.refetch();
              }}
            />
          ) : !accesses.data.length ? (
            <Text
              style={[s.muted, { paddingHorizontal: 12, paddingVertical: 16 }]}
            >
              {copy("validation.noLinks")}
            </Text>
          ) : (
            accesses.data.map((access, index) => (
              <View
                key={access.id}
                style={[
                  s.row,
                  {
                    gap: 12,
                    padding: 12,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: "#ffffff1a",
                  },
                ]}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: access.revokedAt
                      ? "#ffffff0d"
                      : "#ff00441a",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Link2
                    size={16}
                    color={access.revokedAt ? colors.muted : colors.accent}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text
                    numberOfLines={1}
                    style={[s.heading, { fontSize: 14, lineHeight: 20 }]}
                  >
                    {access.label}
                  </Text>
                  <Text numberOfLines={1} style={s.tiny}>
                    {formatDate(access.startsAt, language, true)} –{" "}
                    {formatDate(access.endsAt, language, true)}
                  </Text>
                </View>
                {access.revokedAt ? (
                  <Text style={[s.tiny, { fontWeight: "600" }]}>
                    {copy("validation.revoked")}
                  </Text>
                ) : (
                  <SmallButton
                    icon={Trash2}
                    disabled={busy}
                    label={copy("validation.revoke", { label: access.label })}
                    onPress={() => {
                      void action(async () => {
                        await scannerApi.revokeAccess(
                          event.id,
                          access.id,
                          token,
                        );
                        if (!current()) return;
                        setNotice(copy("validation.linkRevoked"));
                        setUrl("");
                        await accesses.refetch();
                      }, "validation.linkRevokeFailed");
                    }}
                  />
                )}
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );
}
