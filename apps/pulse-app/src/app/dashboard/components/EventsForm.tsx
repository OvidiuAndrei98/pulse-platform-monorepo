"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Trash2 } from "lucide-react";
import { eventCategories } from "@/core/mappers";
import { DeleteEventDialog } from "@/features/events/form/DeleteEventDialog";
import { EventDetailsSection } from "@/features/events/form/EventDetailsSection";
import { TicketTypesSection } from "@/features/events/form/TicketTypesSection";

export const ticketTypeSchema = z.object({
  id: z.string().uuid("ID-ul biletului trebuie sa fie un UUID valid").optional().or(z.literal("").transform(() => undefined)).or(z.null().transform(() => undefined)),
  name: z.string().min(2, "Numele biletului este prea scurt"),
  priceRon: z.coerce.number().min(0, "Pretul nu poate fi negativ"),
  capacity: z.coerce.number().min(1, "Capacitatea trebuie sa fie cel putin 1"),
  description: z.string().max(1000, "Descrierea este prea lunga").optional(),
  startSales: z.string().min(1, "Data de start este obligatorie"),
  endSales: z.string().min(1, "Data de final este obligatorie"),
  ticketsSold: z.number().optional(),
}).refine((data) => new Date(data.endSales) > new Date(data.startSales), { message: "Data de final a vanzarilor trebuie sa fie dupa data de start", path: ["endSales"] });

export const eventFormSchema = z.object({
  title: z.string().min(3, "Titlul trebuie sa aiba cel putin 3 caractere"),
  category: z.string().min(1, "Selecteaza o categorie"),
  startTime: z.string().min(1, "Data de inceput este obligatorie"),
  endTime: z.string().min(1, "Data de final este obligatorie"),
  locationName: z.string().min(1, "Locatia este obligatorie"),
  city: z.string().min(1, "Selecteaza orasul"),
  vibe: z.string().min(1, "Selecteaza vibe-ul"),
  latitude: z.coerce.number({ error: "Latitudinea este obligatorie" }),
  longitude: z.coerce.number({ error: "Longitudinea este obligatorie" }),
  googlePlaceId: z.string(),
  description: z.string().min(10, "Descrierea trebuie sa aiba cel putin 10 caractere"),
  bannerUrl: z.string().url("Introdu un URL valid").optional().or(z.literal("").transform(() => undefined)),
  status: z.enum(["draft", "published"]).default("draft"),
  ticketTypes: z.array(ticketTypeSchema),
}).refine((data) => new Date(data.endTime) > new Date(data.startTime), { message: "Data de final a evenimentului trebuie sa fie dupa data de inceput", path: ["endTime"] });

export type EventFormValues = z.infer<typeof eventFormSchema>;

type EventFormProps = {
  initialValues?: Partial<Omit<EventFormValues, "startTime" | "endTime">> & { startTime?: string; endTime?: string };
  onSubmit: (data: any) => void;
  onDelete?: () => void;
};

const formatToDatetimeLocal = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
};

const formatToISO = (value: string) => (value ? new Date(value).toISOString() : "");

function getDefaultValues(values?: EventFormProps["initialValues"]): EventFormValues {
  return {
    title: values?.title || "",
    category: values?.category || eventCategories[0] || "",
    startTime: formatToDatetimeLocal(values?.startTime),
    endTime: formatToDatetimeLocal(values?.endTime),
    locationName: values?.locationName || "",
    city: values?.city || "",
    vibe: values?.vibe || "",
    latitude: values?.latitude ?? 0,
    longitude: values?.longitude ?? 0,
    googlePlaceId: values?.googlePlaceId || "",
    description: values?.description || "",
    bannerUrl: values?.bannerUrl || undefined,
    status: values?.status || "draft",
    ticketTypes: values?.ticketTypes?.map((ticket) => ({ id: ticket.id, name: ticket.name || "", priceRon: ticket.priceRon ?? 0, capacity: ticket.capacity ?? 100, description: ticket.description || "", ticketsSold: ticket.ticketsSold ?? 0, startSales: formatToDatetimeLocal(ticket.startSales), endSales: formatToDatetimeLocal(ticket.endSales) })) || [],
  };
}

export default function EventForm({ initialValues, onSubmit, onDelete }: EventFormProps) {
  const [mapsReady, setMapsReady] = useState(() => typeof window !== "undefined" && Boolean(window.google?.maps?.places));
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const isEditMode = Boolean(initialValues && Object.keys(initialValues).length);
  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema) as unknown as Resolver<EventFormValues>,
    defaultValues: getDefaultValues(initialValues),
  });

  useEffect(() => {
    if (isEditMode) form.reset(getDefaultValues(initialValues));
  }, [form, initialValues, isEditMode]);

  useEffect(() => {
    if (window.google?.maps?.places) setMapsReady(true);
  }, []);

  const handleFormSubmit = (data: EventFormValues) => {
    onSubmit({
      ...data,
      startTime: formatToISO(data.startTime),
      endTime: formatToISO(data.endTime),
      ticketTypes: data.ticketTypes.map(({ ticketsSold, ...ticket }) => ({ ...ticket, startSales: formatToISO(ticket.startSales), endSales: formatToISO(ticket.endSales) })),
    });
  };

  return (
    <>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <Script id="google-maps-places" src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`} strategy="afterInteractive" onLoad={() => setMapsReady(true)} onReady={() => setMapsReady(true)} />
        <EventDetailsSection form={form} mapsReady={mapsReady} />
        <TicketTypesSection form={form} />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {isEditMode && <button type="button" onClick={() => setShowDeleteModal(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-5 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 active:scale-[0.99]"><Trash2 className="h-4 w-4" /> Sterge evenimentul</button>}
          <button type="submit" className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black shadow-sm transition hover:opacity-95 active:scale-[0.99]">{isEditMode ? "Salveaza modificarile" : "Creeaza evenimentul"}</button>
        </div>
      </form>
      {showDeleteModal && <DeleteEventDialog onCancel={() => setShowDeleteModal(false)} onConfirm={() => { setShowDeleteModal(false); onDelete?.(); }} />}
    </>
  );
}
