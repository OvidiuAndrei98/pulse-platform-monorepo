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

export default function EditEventPage() {
  const router = useRouter();
  const { user } = useDataProvider();
  const [event, setEvent] = useState<Event>({} as Event);
  const [loading, setLoading] = useState(true);
  const params = useParams();
  const eventId = params?.eventId as string;

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
      await user?.handleUpdateEvent(eventId, data);
      router.push("/dashboard/events");
    } catch (error) {
      console.error("Eroare la salvarea evenimentului:", error);
    }
  };

  const handleDelete = async () => {
    try {
      await user?.handleDeleteEvent(eventId);
      router.push("/dashboard/events");
    } catch (error) {
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
            {"Editare eveniment"}
          </h1>
        </div>

        <EventForm
          onSubmit={(data) => handleSave(data)}
          initialValues={{
            ...event,
            status: event.status === "published" ? "published" : "draft",
          }}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
