import { FormScrollView } from "../ui/KeyboardForms";
import React, { useRef, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { ApiError } from "../data/http";
import { usePreferences } from "../PreferencesProvider";
import { Feedback, Loading } from "../ui/common";
import { dashboardApi, dColors as colors, useDashboardQuery } from "./common";
import type { DashboardEvent, OrganizerProfile } from "./data";
import {
  DashboardHeader,
  DashboardSidebar,
  type DashboardSection,
} from "./DashboardNavigation";
import { DashboardOverview } from "./DashboardOverview";
import { DashboardEvents } from "./DashboardEvents";
import { DashboardProfile, DashboardPurchases } from "./DashboardAccount";
import { Company } from "./DashboardCompany";
import { EventEditor } from "./EventEditor";
import { Finance, Invoicing } from "./Finance";
import { Promotions } from "./Promotions";
import {
  OrganizerAgreement,
  OrganizerStripeInformation,
} from "./OrganizerDocuments";
import { ScannerScreen } from "../scanner/ScannerScreen";

export type DashboardScreenProps = {
  onClose(): void;
  onSignIn?(): void;
  onScanner(): void;
  onTickets(): void;
  onOrders(): void;
  onProfileSettings(): void;
  onPublicProfile(): void;
  initialSection?: DashboardSection | "scanner";
  initialEventId?: string;
  organizerReturn?: "connect" | "promotion";
  campaignId?: string;
  returnStatus?: "complete" | "refresh" | "cancelled";
};
export function DashboardScreen(props: DashboardScreenProps) {
  const auth = useAuth(),
    { copy } = usePreferences(),
    safe = useSafeAreaInsets(),
    { width } = useWindowDimensions();
  const organizer =
    auth.user?.role === "organizer" || auth.user?.role === "admin";
  const [section, setSection] = useState<DashboardSection | "scanner">(
    props.organizerReturn === "promotion"
      ? "promotions"
      : props.organizerReturn === "connect"
        ? "overview"
        : (props.initialSection ?? (organizer ? "overview" : "scanner")),
  );
  const [eventId, setEventId] = useState(props.initialEventId ?? ""),
    [template, setTemplate] = useState<DashboardEvent>();
  const scroll = useRef<ScrollView>(null);
  const events = useQuery({
    queryKey: ["dashboard", auth.user?.id, "/dashboard/events"],
    enabled: organizer,
    queryFn: ({ signal }) => dashboardApi.events(signal),
  });
  const profile = useQuery({
    queryKey: [
      "dashboard",
      auth.user?.id,
      "/dashboard/organizer/profile/" + auth.user?.id,
    ],
    enabled: organizer,
    queryFn: async ({ signal }) => {
      try {
        return await accountApi<OrganizerProfile>(
          "/dashboard/organizer/profile/" + auth.user?.id,
          { signal },
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
  const selected = useQuery({
    queryKey: ["dashboard", auth.user?.id, `/dashboard/events/${eventId}`],
    enabled: organizer && section === "edit" && !!eventId,
    queryFn: ({ signal }) => dashboardApi.event(eventId, signal),
  });
  const go = (value: string) => {
    if (value === "logout") {
      props.onClose();
      void auth.controller.logout();
      return;
    }
    if (!organizer && value === "profile") {
      props.onProfileSettings();
      return;
    }
    setTemplate(undefined);
    setSection(value as DashboardSection | "scanner");
  };
  const openEvent = (id: string) => {
    setEventId(id);
    setSection("edit");
  };
  const publicDocument = section === "agreement" || section === "stripe-info";
  if (!auth.ready || (!auth.user && !publicDocument))
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Loading />
      </View>
    );
  const actualSection = publicDocument
    ? section
    : organizer
      ? section
      : "scanner";
  const documentPage =
    actualSection === "agreement" || actualSection === "stripe-info";
  return (
    <View
      testID="organizer-dashboard"
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        paddingTop: safe.top,
        flexDirection: width >= 768 ? "row" : "column",
      }}
    >
      {width >= 768 && !documentPage && (
        <DashboardSidebar
          section={actualSection}
          onNavigate={go}
          validator={!organizer}
        />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {!documentPage && (
          <DashboardHeader
            section={actualSection}
            onNavigate={go}
            validator={!organizer}
          />
        )}
        {actualSection === "scanner" ? (
          <ScannerScreen embedded eventId={props.initialEventId} />
        ) : (
          <FormScrollView
            ref={scroll}
            testID="dashboard-content"
            key={actualSection === "edit" ? `edit-${eventId}` : actualSection}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingBottom:
                Math.max(safe.bottom, 0) +
                (actualSection === "new" || actualSection === "edit"
                  ? 128
                  : 110),
            }}
          >
            <View
              testID="dashboard-page"
              style={{
                width: "100%",
                maxWidth:
                  actualSection === "new" ||
                  actualSection === "edit" ||
                  documentPage
                    ? 768
                    : actualSection === "company"
                      ? 672
                      : 1024,
                alignSelf: "center",
                paddingHorizontal:
                  width >= 640 ? (actualSection === "agreement" ? 28 : 32) : 20,
                paddingTop:
                  actualSection === "agreement" ? (width >= 640 ? 64 : 48) : 32,
                gap: 24,
              }}
            >
              {actualSection === "overview" ? (
                <DashboardOverview
                  events={events.data ?? []}
                  profile={profile.data ?? undefined}
                  loading={events.isPending || profile.isPending}
                  error={events.isError || profile.isError}
                  onRetry={() => {
                    void events.refetch();
                    void profile.refetch();
                  }}
                  onEvent={openEvent}
                  onNew={() => go("new")}
                  onCompany={() => go("company")}
                  onAgreement={() => go("agreement")}
                  onStripeInfo={() => go("stripe-info")}
                  onPromotions={() => go("promotions")}
                  onEvents={() => go("events")}
                  returning={props.organizerReturn === "connect"}
                />
              ) : actualSection === "events" ? (
                <DashboardEvents
                  events={events.data ?? []}
                  loading={events.isPending}
                  error={events.isError}
                  retry={() => void events.refetch()}
                  onEvent={openEvent}
                  onNew={() => go("new")}
                />
              ) : actualSection === "new" ? (
                <EventEditor
                  key={template?.id ?? "new"}
                  template={template}
                  onSaved={() => go("events")}
                  onDeleted={() => go("events")}
                  onBack={() => go("overview")}
                  onNavigate={() =>
                    scroll.current?.scrollTo({ y: 0, animated: true })
                  }
                />
              ) : actualSection === "edit" ? (
                selected.isPending ? (
                  <Loading />
                ) : selected.isError || !selected.data ? (
                  <Feedback
                    title={copy("eventForm.loadFailed")}
                    retry={() => void selected.refetch()}
                  />
                ) : (
                  <EventEditor
                    key={selected.data.id}
                    event={selected.data}
                    onSaved={() => go("events")}
                    onDeleted={() => go("events")}
                    onBack={() => go("events")}
                    onNavigate={() =>
                      scroll.current?.scrollTo({ y: 0, animated: true })
                    }
                    onUseAsTemplate={() => {
                      setTemplate(selected.data);
                      setSection("new");
                    }}
                  />
                )
              ) : actualSection === "finance" ? (
                <Finance />
              ) : actualSection === "invoicing" ? (
                <Invoicing />
              ) : actualSection === "promotions" ? (
                <Promotions
                  events={events.data ?? []}
                  profile={profile.data ?? undefined}
                  profileLoading={profile.isPending}
                  profileError={profile.isError}
                  onRetryProfile={() => void profile.refetch()}
                  returnCampaignId={
                    props.organizerReturn === "promotion"
                      ? props.campaignId
                      : undefined
                  }
                />
              ) : actualSection === "company" ? (
                <Company
                  profile={profile.data ?? undefined}
                  loading={profile.isPending}
                  error={profile.isError}
                  onRetry={() => void profile.refetch()}
                  onAgreement={() => go("agreement")}
                />
              ) : actualSection === "agreement" ? (
                <OrganizerAgreement
                  signedIn={!!auth.user}
                  onSignIn={props.onSignIn}
                  profile={profile.data ?? undefined}
                  loading={organizer && profile.isPending}
                  error={organizer && profile.isError}
                  onRetry={() => void profile.refetch()}
                  onCompany={() =>
                    auth.user ? go("company") : props.onSignIn?.()
                  }
                  onAccepted={() => go("overview")}
                  onHome={props.onClose}
                />
              ) : actualSection === "stripe-info" ? (
                <OrganizerStripeInformation
                  onHome={props.onClose}
                  onAgreement={() => go("agreement")}
                />
              ) : actualSection === "profile" ? (
                <DashboardProfile
                  profile={profile.data ?? undefined}
                  loading={profile.isPending}
                  error={profile.isError}
                  retry={() => void profile.refetch()}
                  onCompany={() => go("company")}
                />
              ) : (
                <DashboardPurchases />
              )}
            </View>
          </FormScrollView>
        )}
      </View>
    </View>
  );
}
