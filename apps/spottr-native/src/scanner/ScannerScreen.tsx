import { ScannerAdmissionPanel } from "./presentation/ScannerAdmissionPanel";
import { ActionIcon } from '../ui/ActionIcon';
import { useScannerController } from "./useScannerController";

import { RefreshControl, ScrollView, View } from "react-native";

import { Wifi, WifiOff } from "lucide-react-native";

import { Button, Feedback, IconButton } from "../ui/common";
import { Text } from "../ui/Text";
import { Action, dColors as colors } from "../dashboard/common";
import { Company } from "../dashboard/DashboardCompany";
import { OrganizerAgreement } from "../dashboard/OrganizerDocuments";

import { formatDate } from "../data/events";

import { s } from "./ScannerPanel";
import { AccountScannerManagement } from "./ScannerManagement";
import { ScannerEventList } from "./ScannerEventList";
import { WardrobeTabs as SectionTabs } from "../wardrobe/WardrobeTabs";

export function ScannerScreen(props: Parameters<typeof useScannerController>[0]) {
  const model = useScannerController(props);
  const {
    agreementOpen,
    busy,
    canManage,
    copy,
    embedded,
    error,
    event,
    events,
    insets,
    language,
    navigation,
    notice,
    offline,
    offlineState,
    organizer,
    profile,
    rememberEvent,
    ro,
    setAgreementOpen,
    setSelected,
    setTab,
    tab,
    authenticated,
    visibleTab,
    width,
    work,
  } = model;

  if (!authenticated)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: insets.top + 32,
        }}
      >
        <Feedback title={copy("scanner.sessionUnavailable")} />
        <Button
          title={ro ? "Conectează-te" : "Sign in"}
          onPress={() => navigation.navigate("Auth", { returnScanner: true })}
        />
      </View>
    );

  const pending =
      offlineState?.scans.filter((scan) => scan.status === "pending").length ??
      0,
    conflicts =
      offlineState?.scans.filter((scan) => scan.status === "conflict") ?? [];

  const needsCompany =
    organizer &&
    !offline &&
    profile.isSuccess &&
    profile.data?.verificationStatus !== "approved";

  const company = (
    <Company
      profile={profile.data ?? undefined}
      loading={profile.isLoading}
      error={profile.isError && !offline}
      onRetry={() => {
        void profile.refetch();
      }}
      onAgreement={() => setAgreementOpen(true)}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={events.isFetching && !events.isPending}
            onRefresh={() => {
              void events.refetch();
            }}
            tintColor={colors.accent}
          />
        }
        contentContainerStyle={{
          paddingTop: embedded ? 32 : insets.top + 20,
          paddingHorizontal: width >= 640 ? 32 : 20,
          paddingBottom: insets.bottom + (embedded ? 110 : 36),
          maxWidth: needsCompany ? 672 : 1024,
          width: "100%",
          alignSelf: "center",
        }}
      >
        {!embedded && (
          <View style={{ marginBottom: 20 }}>
            <IconButton
              label={copy("common.back")}
              onPress={() =>
                navigation.canGoBack()
                  ? navigation.goBack()
                  : navigation.navigate("Tabs", { screen: "Profile" })
              }
            >
              <ActionIcon name="back" color="white" size={22} />
            </IconButton>
          </View>
        )}
        {agreementOpen ? (
          <View style={{ gap: 20 }}>
            <IconButton
              label={copy("common.back")}
              onPress={() => setAgreementOpen(false)}
            >
              <ActionIcon name="back" color="white" size={22} />
            </IconButton>
            <OrganizerAgreement
              profile={profile.data ?? undefined}
              onCompany={() => setAgreementOpen(false)}
              onHome={() => setAgreementOpen(false)}
            />
          </View>
        ) : needsCompany ? (
          company
        ) : (
          <View testID="scanner-page" style={{ gap: 24 }}>
            <View
              style={[
                s.row,
                {
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16,
                },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontSize: width >= 640 ? 30 : 24,
                    lineHeight: width >= 640 ? 36 : 32,
                    fontWeight: "700",
                  }}
                >
                  {copy("validation.title")}
                </Text>
                <Text style={s.muted}>{copy("validation.subtitle")}</Text>
              </View>
              <View
                style={[
                  s.row,
                  {
                    flexShrink: 0,
                    marginTop: 4,
                    gap: 6,
                    borderRadius: 99,
                    borderWidth: 1,
                    borderColor: offline ? "#fcd34d59" : "#ff004459",
                    backgroundColor: offline ? "#fcd34d1a" : "#ff00441a",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                  },
                ]}
              >
                {offline ? (
                  <WifiOff size={14} color="#fde68a" />
                ) : (
                  <Wifi size={14} color={colors.accent} />
                )}
                <Text
                  testID="scanner-connection"
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: offline ? "#fde68a" : colors.accent,
                  }}
                >
                  {offline ? copy('validation.offline') : events.isPending || events.isError ? (ro ? 'Se verifică conexiunea' : 'Checking connection') : copy('validation.online')}
                </Text>
              </View>
            </View>
            {events.isError ? (
              <Feedback
                title={copy("validation.eventsLoadFailed")}
                retry={() => {
                  void events.refetch();
                }}
              />
            ) : null}
            {!event ? <ScannerEventList events={events.data?.events ?? []} loading={events.isPending} failed={events.isError} offline={offline}
              onRefresh={() => { void events.refetch(); }} onSelect={id => { setTab("scan"); setSelected(id); rememberEvent(id); }} /> : <>
            <View style={{ gap: 12 }}>
              <Action secondary title={copy("validation.changeEvent")} disabled={busy || work}
                onPress={() => { setTab("scan"); setSelected(""); rememberEvent(); }}
                style={{ alignSelf: "flex-start", minHeight: 44, backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line }}
                textStyle={{ color: colors.text, fontSize: 14 }} />
              <Text accessibilityRole="header" style={[s.heading, { fontSize: 20 }]}>{event.title}</Text>
              <Text style={s.muted}>{formatDate(event.startTime, language, true)} · {event.locationName}</Text>
            </View>
            <View testID="scanner-tabs">
              <SectionTabs id="scanner-tab" panelId="scanner-panel" label={copy("validation.title")} ro={ro}
                value={visibleTab} onChange={setTab}
                options={[
                  { value: "scan", label: copy("validation.scanTab") },
                  ...(canManage ? [
                    { value: "team" as const, label: copy("validation.validationTeam") },
                    { value: "links" as const, label: copy("validation.quickAccess") },
                  ] : []),
                ]} />
            </View>
            <View nativeID="scanner-panel" role="tabpanel" aria-labelledby={'scanner-tab-'+visibleTab} style={{gap:24}}>
            {canManage && tab !== "scan" ? (
              <>
                {organizer && company}
                {event?.canManage && (
                  <AccountScannerManagement
                    key={event.id}
                    event={event}
                    section={tab}
                  />
                )}
              </>
            ) : (
              <ScannerAdmissionPanel model={model} conflicts={conflicts} pending={pending}/>
            )}
            </View>
            {!!notice && (
              <Text
                accessibilityLiveRegion="polite"
                style={[s.muted, { color: colors.accent }]}
              >
                {notice}
              </Text>
            )}
            </>}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
