"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CreateEventPayload } from "@/core/DataProvider";
import EventForm from "../../components/EventsForm";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";
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

  const handleSave = async (
    status: "draft" | "published",
    data: Omit<CreateEventPayload, "status"> & { ticketTypes: DraftTicket[] },
  ) => {
    try {
      if (!user) return;
      await user.handleCreateEvent({
        ...data,
        status: status,
      });
      toast.success(t("eventForm.eventCreated"));
      router.push("/dashboard/events");
    } catch (error) {
      toast.error(t("eventForm.eventCreateFailed"));
      console.error("Eroare la salvarea evenimentului:", error);
    }
  };

  return (
    <div className="relative min-h-screen  pb-40 text-foreground antialiased">
      <div className="mx-auto max-w-3xl px-5 pt-8">
        <Link
          href="/dashboard/events"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Înapoi la dashboard
        </Link>

        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {t("eventForm.createEvent")}
          </h1>
        </div>

        <EventForm onSubmit={(data) => handleSave("published", data)} />
      </div>
    </div>
  );
}
