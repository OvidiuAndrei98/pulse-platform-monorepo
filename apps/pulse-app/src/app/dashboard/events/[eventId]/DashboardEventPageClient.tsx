"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  CreateEventPayload,
  Event,
  UpdateEventPayload,
} from "@/core/DataProvider";
import EventForm from "../../components/EventsForm";
import { useDataProvider } from "@/core/DataProviderContext";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ApiError } from "@packages/api-client/src/Client";
import { OrganizerUpdatesManager } from "../../components/OrganizerUpdatesManager";

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
    setQueryEventId(new URLSearchParams(window.location.search).get("eventId") ?? "");
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

  return (
    <div className="relative min-h-screen bg-background pb-40 text-foreground antialiased">
      <div className="mx-auto max-w-3xl px-5 pt-8">
        <Link
          href="/dashboard/events"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Înapoi la dashboard
        </Link>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t("eventForm.editEvent")}
          </h1>
        </div>

        {loading ? <div className="mt-6 h-[34rem] animate-pulse rounded-lg border border-white/10 bg-white/[0.03]" /> : event ? <>
          <EventForm
            onSubmit={(data) => handleSave(data)}
            initialValues={{
              ...event,
              status: event.status === "published" ? "published" : "draft",
            }}
            onDelete={handleDelete}
          />
          <OrganizerUpdatesManager eventId={event.id} status={event.status} endTime={event.endTime} />
        </> : <p className="mt-6 text-sm text-muted-foreground">{t("eventForm.loadFailed")}</p>}
      </div>
    </div>
  );
}
