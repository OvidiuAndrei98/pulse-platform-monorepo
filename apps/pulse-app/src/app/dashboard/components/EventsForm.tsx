"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Copy, Trash2 } from "lucide-react";
import { eventCategories } from "@/core/mappers";
import { DeleteEventDialog } from "@/features/events/form/DeleteEventDialog";
import { EventDetailsSection } from "@/features/events/form/EventDetailsSection";
import { TicketTypesSection } from "@/features/events/form/TicketTypesSection";
import { LineupSection } from "@/features/events/lineup/LineupSection";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

export const ticketTypeSchema = z.object({
  id: z.string().uuid(i18n.t("formValidation.invalidTicketId")).optional().or(z.literal("").transform(() => undefined)).or(z.null().transform(() => undefined)),
  name: z.string().min(2, i18n.t("formValidation.ticketNameShort")),
  priceRon: z.coerce.number().min(0, i18n.t("formValidation.priceNegative")),
  capacity: z.coerce.number().min(1, i18n.t("formValidation.capacityMinimum")),
  description: z.string().max(1000, i18n.t("formValidation.descriptionLong")).optional(),
  startSales: z.string().min(1, i18n.t("formValidation.salesStartRequired")),
  endSales: z.string().min(1, i18n.t("formValidation.salesEndRequired")),
  ticketsSold: z.number().optional(),
}).refine((data) => new Date(data.endSales) > new Date(data.startSales), { message: i18n.t("formValidation.salesEndAfterStart"), path: ["endSales"] });

export const lineupArtistSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, i18n.t("formValidation.artistNameRequired")).max(120),
  imageUrl: z.string().optional().default(""),
  stage: z.string().max(120).optional().default(""),
  performanceTime: z.string().max(40).optional().default(""),
  spotifyUrl: z.string().optional().default(""),
  isHeadliner: z.boolean().default(false),
  source: z.enum(["SPOTIFY", "MANUAL"]),
});

export const eventFormSchema = z.object({
  title: z.string().min(3, i18n.t("formValidation.titleShort")),
  category: z.string().min(1, i18n.t("formValidation.categoryRequired")),
  startTime: z.string().min(1, i18n.t("formValidation.startRequired")),
  endTime: z.string().min(1, i18n.t("formValidation.endRequired")),
  locationName: z.string().min(1, i18n.t("formValidation.locationRequired")),
  city: z.string().min(1, i18n.t("formValidation.cityRequired")),
  vibe: z.string().min(1, i18n.t("formValidation.vibeRequired")),
  latitude: z.coerce.number({ error: i18n.t("formValidation.latitudeRequired") }),
  longitude: z.coerce.number({ error: i18n.t("formValidation.longitudeRequired") }),
  googlePlaceId: z.string(),
  description: z.string().min(10, i18n.t("formValidation.descriptionShort")),
  bannerUrl: z.string().url(i18n.t("formValidation.invalidUrl")).optional().or(z.literal("").transform(() => undefined)),
  status: z.enum(["draft", "scheduled", "published", "completed"]).default("draft"),
  publishAt: z.string().optional(),
  organizerAbsorbsServiceFee: z.boolean().default(false),
  ticketTypes: z.array(ticketTypeSchema),
  lineup: z.array(lineupArtistSchema).default([]),
}).refine((data) => new Date(data.endTime) > new Date(data.startTime), { message: i18n.t("formValidation.endAfterStart"), path: ["endTime"] })
  .refine((data) => data.status !== "scheduled" || Boolean(data.publishAt && new Date(data.publishAt) > new Date()), { message: i18n.t("formValidation.publishTimeFuture"), path: ["publishAt"] });

export type EventFormValues = z.infer<typeof eventFormSchema>;

type EventFormProps = {
  initialValues?: Partial<Omit<EventFormValues, "startTime" | "endTime" | "lineup">> & {
    startTime?: string;
    endTime?: string;
    lineup?: Array<Partial<EventFormValues["lineup"][number]>>;
  };
  onSubmit: (data: any) => void;
  onDelete?: () => void;
  readOnly?: boolean;
  onUseAsTemplate?: () => void;
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
    publishAt: formatToDatetimeLocal(values?.publishAt),
    organizerAbsorbsServiceFee: values?.organizerAbsorbsServiceFee ?? false,
    ticketTypes: values?.ticketTypes?.map((ticket) => ({ id: ticket.id, name: ticket.name || "", priceRon: ticket.priceRon ?? 0, capacity: ticket.capacity ?? 100, description: ticket.description || "", ticketsSold: ticket.ticketsSold ?? 0, startSales: formatToDatetimeLocal(ticket.startSales), endSales: formatToDatetimeLocal(ticket.endSales) })) || [],
    lineup: values?.lineup?.map((artist) => ({ id: artist.id, name: artist.name || "", imageUrl: artist.imageUrl || "", stage: artist.stage || "", performanceTime: artist.performanceTime || "", spotifyUrl: artist.spotifyUrl || "", isHeadliner: artist.isHeadliner ?? false, source: artist.source || "MANUAL" })) || [],
  };
}

export default function EventForm({ initialValues, onSubmit, onDelete, readOnly = false, onUseAsTemplate }: EventFormProps) {
  const { t } = useTranslation();
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
      publishAt: data.status === "scheduled" && data.publishAt ? formatToISO(data.publishAt) : undefined,
      ticketTypes: data.ticketTypes.map(({ ticketsSold, ...ticket }) => ({ ...ticket, startSales: formatToISO(ticket.startSales), endSales: formatToISO(ticket.endSales) })),
      lineup: data.lineup.map(({ id: _id, ...artist }) => artist),
    });
  };

  return (
    <>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <Script id="google-maps-places" src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`} strategy="afterInteractive" onLoad={() => setMapsReady(true)} onReady={() => setMapsReady(true)} />
        <fieldset disabled={readOnly} className="space-y-6 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-70 [&_input:disabled]:cursor-not-allowed [&_textarea:disabled]:cursor-not-allowed">
          <EventDetailsSection form={form} mapsReady={mapsReady} />
          <LineupSection form={form} />
          <TicketTypesSection form={form} />
        </fieldset>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!readOnly && onDelete && <button type="button" onClick={() => setShowDeleteModal(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-5 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 active:scale-[0.99]"><Trash2 className="h-4 w-4" /> {t("eventForm.deleteEvent")}</button>}
          {readOnly ? <button type="button" onClick={onUseAsTemplate} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 active:scale-[0.99]"><Copy className="h-4 w-4" />{t("eventForm.useAsTemplate")}</button> : <button type="submit" className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black shadow-sm transition hover:opacity-95 active:scale-[0.99]">{onDelete ? t("eventForm.saveChanges") : t("eventForm.createEvent")}</button>}
        </div>
      </form>
      {showDeleteModal && <DeleteEventDialog onCancel={() => setShowDeleteModal(false)} onConfirm={() => { setShowDeleteModal(false); onDelete?.(); }} />}
    </>
  );
}
