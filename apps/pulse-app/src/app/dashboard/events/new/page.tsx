"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CreateEventPayload } from "@/core/DataProvider";
import EventForm from "../../components/EventsForm";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import type { EventFormValues } from "../../components/EventsForm";
import { toast } from "sonner";

interface DraftTicket {
  startSales: string;
  endSales: string;
  name: string;
  priceRon: number;
  capacity: number;
  description?: string;
}

export default function NewEventPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const { user } = useDataProvider();
  const [template, setTemplate] = useState<Partial<EventFormValues>>();

  useEffect(() => {
    const raw = sessionStorage.getItem("pulse:event-template");
    if (!raw) return;
    sessionStorage.removeItem("pulse:event-template");
    try {
      setTemplate(JSON.parse(raw) as Partial<EventFormValues>);
    } catch {
      setTemplate(undefined);
    }
  }, []);

  const handleSave = async (
    data: CreateEventPayload & { ticketTypes: DraftTicket[] },
  ) => {
    try {
      if (!user) return;
      await user.handleCreateEvent({
        ...data,
      });
      toast.success(t("eventForm.eventCreated"));
      router.push("/dashboard/events");
    } catch (error) {
      toast.error(t("eventForm.eventCreateFailed"));
      console.error("Eroare la salvarea evenimentului:", error);
    }
  };

  return (
    <div className="relative pb-[calc(8rem+var(--native-safe-bottom,0px))] text-foreground antialiased">
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
            {t("eventForm.createEvent")}
          </h1>
        </div>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("eventEditor.createHint")}
        </p>
        <EventForm
          mode="create"
          initialValues={template}
          onSubmit={handleSave}
        />
      </div>
    </div>
  );
}
