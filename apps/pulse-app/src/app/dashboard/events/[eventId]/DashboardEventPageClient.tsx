"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Event, UpdateEventPayload } from "@/core/DataProvider";
import EventForm from "../../components/EventsForm";
import { useDataProvider } from "@/core/DataProviderContext";
import { useState, useEffect, useMemo, type ComponentProps } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ApiError } from "@packages/api-client/src/Client";
import { OrganizerUpdatesManager } from "../../components/OrganizerUpdatesManager";
import { InvitationManager } from "../../components/InvitationManager";
import { PromoCodeManager } from "../../components/PromoCodeManager";
import { EventCancellationManager } from "../../components/EventCancellationManager";

export default function EditEventPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useDataProvider();
  const [event, setEvent] = useState<Event>();
  const [loading, setLoading] = useState(true);
  const params = useParams<{ eventId?: string }>();
  const [queryEventId, setQueryEventId] = useState("");
  const eventId = params?.eventId ?? queryEventId;

  useEffect(() => {
    setQueryEventId(
      new URLSearchParams(window.location.search).get("eventId") ?? "",
    );
  }, []);

  useEffect(() => {
    if (!user || !eventId) return;
    const fetchEvent = async () => {
      try {
        const fetchedEvent = await user.handleGetOrganizerEvent(eventId);
        if (fetchedEvent) {
          setEvent(fetchedEvent);
        }
      } catch (error) {
        console.error("Eroare la încărcarea evenimentului:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [eventId, user]);

  const handleSave = async (data: UpdateEventPayload) => {
    try {
      if (!user) return;
      await user.handleUpdateEvent(eventId, data);
      toast.success(t("eventForm.eventSaved"));
      router.push("/dashboard/events");
    } catch (error) {
      toast.error(t("eventForm.eventSaveFailed"));
      console.error("Eroare la salvarea evenimentului:", error);
    }
  };

  const handleDelete = async () => {
    try {
      if (!user) return;
      await user.handleDeleteEvent(eventId);
      toast.success(t("eventForm.eventDeleted"));
      router.push("/dashboard/events");
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.status === 409
          ? t("eventForm.deleteBlocked")
          : t("eventForm.eventDeleteFailed"),
      );
      console.error("Eroare la ștergerea evenimentului:", error);
    }
  };

  const useAsTemplate = () => {
    if (!event) return;
    const duration = Math.max(
      60 * 60 * 1000,
      new Date(event.endTime).getTime() - new Date(event.startTime).getTime(),
    );
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + duration);
    sessionStorage.setItem(
      "pulse:event-template",
      JSON.stringify({
        ...event,
        id: undefined,
        status: "draft",
        publishAt: undefined,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        stats: undefined,
        ticketTypes: event.ticketTypes.map(
          ({ id: _id, ticketsSold: _sold, ...ticket }) => ({
            ...ticket,
            startSales: new Date().toISOString(),
            endSales: start.toISOString(),
          }),
        ),
        lineup: event.lineup.map(({ id: _id, ...artist }) => artist),
      }),
    );
    router.push("/dashboard/events/new?template=1");
  };

  const completed =
    event?.status === "completed" ||
    Boolean(event && new Date(event.endTime).getTime() <= Date.now());
  const cancellationLocked = Boolean(
    event &&
    ["cancel_pending", "refunding", "cancelled"].includes(event.status),
  );
  const initialValues = useMemo<
    ComponentProps<typeof EventForm>["initialValues"]
  >(
    () =>
      event
        ? {
            ...event,
            status:
              completed || cancellationLocked
                ? ("completed" as const)
                : event.status === "published" || event.status === "scheduled"
                  ? event.status
                  : ("draft" as const),
          }
        : undefined,
    [event, completed, cancellationLocked],
  );

  return (
    <div className="relative bg-background pb-[calc(8rem+var(--native-safe-bottom,0px))] text-foreground antialiased">
      <div className="app-page-spacing mx-auto max-w-3xl">
        <Link
          href="/dashboard/events"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />{" "}
          {t("dashboardNav.backToDashboard")}
        </Link>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t("eventForm.editEvent")}
          </h1>
        </div>

        {loading ? (
          <div className="mt-6 h-[34rem] animate-pulse rounded-lg bg-white/[0.03]" />
        ) : event ? (
          <>
            {(completed || cancellationLocked) && (
              <div className="mt-5 border-l-2 border-primary pl-4">
                <p className="text-sm font-semibold text-primary">
                  {completed
                    ? t("organizerEvents.completed")
                    : t(`eventCancellation.eventStatus.${event.status}`)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {completed
                    ? t("eventForm.completedReadOnly")
                    : t("eventCancellation.locked")}
                </p>
              </div>
            )}
            <EventForm
              mode="edit"
              onSubmit={handleSave}
              initialValues={initialValues}
              readOnly={completed || cancellationLocked}
              onDelete={
                completed || cancellationLocked ? undefined : handleDelete
              }
              onUseAsTemplate={
                event.status === "cancelled" || completed
                  ? useAsTemplate
                  : undefined
              }
              administration={
                <>
                  {!event.externalTicketUrl && (
                    <>
                      <InvitationManager
                        event={event}
                        readOnly={completed || cancellationLocked}
                      />
                      <PromoCodeManager
                        event={event}
                        readOnly={completed || cancellationLocked}
                      />
                    </>
                  )}
                  {!completed && !cancellationLocked && (
                    <OrganizerUpdatesManager
                      eventId={event.id}
                      status={event.status}
                      endTime={event.endTime}
                    />
                  )}
                  <EventCancellationManager
                    event={event}
                    onRequested={() =>
                      setEvent((current) =>
                        current
                          ? { ...current, status: "cancel_pending" }
                          : current,
                      )
                    }
                  />
                </>
              }
            />
          </>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            {t("eventForm.loadFailed")}
          </p>
        )}
      </div>
    </div>
  );
}
