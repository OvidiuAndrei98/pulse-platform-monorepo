"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Script from "next/script";
import { type FieldErrors, Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { eventCategories } from "@/core/mappers";
import { DeleteEventDialog } from "@/features/events/form/DeleteEventDialog";
import { EventDetailsSection } from "@/features/events/form/EventDetailsSection";
import { TicketTypesSection } from "@/features/events/form/TicketTypesSection";
import { LineupSection } from "@/features/events/lineup/LineupSection";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { EventPublicationSection } from "@/features/events/form/EventPublicationSection";
import { formatToDatetimeLocal } from "@/features/events/form/dateTimeValues";
import {
  basicsFields,
  scheduleFields,
  getErrorDestination,
  type EditorSection,
} from "@/features/events/form/editorSections";

export const ticketTypeSchema = z
  .object({
    id: z
      .string()
      .uuid(i18n.t("formValidation.invalidTicketId"))
      .optional()
      .or(z.literal("").transform(() => undefined))
      .or(z.null().transform(() => undefined)),
    name: z.string().min(2, i18n.t("formValidation.ticketNameShort")),
    priceRon: z.coerce.number().min(0, i18n.t("formValidation.priceNegative")),
    capacity: z.coerce
      .number()
      .min(1, i18n.t("formValidation.capacityMinimum")),
    description: z
      .string()
      .max(1000, i18n.t("formValidation.descriptionLong"))
      .optional(),
    startSales: z.string().min(1, i18n.t("formValidation.salesStartRequired")),
    endSales: z.string().min(1, i18n.t("formValidation.salesEndRequired")),
    ticketsSold: z.number().optional(),
  })
  .refine((data) => new Date(data.endSales) > new Date(data.startSales), {
    message: i18n.t("formValidation.salesEndAfterStart"),
    path: ["endSales"],
  });

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

export const eventFormSchema = z
  .object({
    title: z.string().min(3, i18n.t("formValidation.titleShort")),
    category: z.string().min(1, i18n.t("formValidation.categoryRequired")),
    startTime: z.string().min(1, i18n.t("formValidation.startRequired")),
    endTime: z.string().min(1, i18n.t("formValidation.endRequired")),
    locationName: z.string().min(1, i18n.t("formValidation.locationRequired")),
    city: z.string().min(1, i18n.t("formValidation.cityRequired")),
    vibe: z.string().min(1, i18n.t("formValidation.vibeRequired")),
    latitude: z.coerce.number({
      error: i18n.t("formValidation.latitudeRequired"),
    }),
    longitude: z.coerce.number({
      error: i18n.t("formValidation.longitudeRequired"),
    }),
    googlePlaceId: z.string(),
    description: z.string().min(10, i18n.t("formValidation.descriptionShort")),
    bannerUrl: z
      .string()
      .url(i18n.t("formValidation.invalidUrl"))
      .optional()
      .or(z.literal("").transform(() => undefined)),
    status: z
      .enum(["draft", "scheduled", "published", "completed"])
      .default("draft"),
    publishAt: z.string().optional(),
    ticketingMode: z.enum(["spottr", "external"]).default("spottr"),
    externalTicketUrl: z.string().max(2048).optional().default(""),
    organizerAbsorbsServiceFee: z.boolean().default(false),
    vatPercentage: z.number().optional(),
    ticketTypes: z.array(ticketTypeSchema),
    lineup: z.array(lineupArtistSchema).default([]),
  })
  .superRefine((data, context) => {
    if (data.ticketingMode === "external") {
      try {
        const externalURL = new URL(data.externalTicketUrl || "");
        if (externalURL.protocol !== "https:" || externalURL.username || externalURL.password) throw new Error();
      } catch {
        context.addIssue({
          code: "custom",
          path: ["externalTicketUrl"],
          message: i18n.t("ticketForm.externalUrlRequired"),
        });
      }
      return;
    }
    if (data.vatPercentage !== 21 && data.vatPercentage !== 11 && data.vatPercentage !== 0) {
      context.addIssue({
        code: "custom",
        path: ["vatPercentage"],
        message: i18n.t("ticketForm.vatRequired"),
      });
    }
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: i18n.t("formValidation.endAfterStart"),
    path: ["endTime"],
  })
  .refine(
    (data) =>
      data.status !== "scheduled" ||
      Boolean(data.publishAt && new Date(data.publishAt) > new Date()),
    {
      message: i18n.t("formValidation.publishTimeFuture"),
      path: ["publishAt"],
    },
  );

export type EventFormValues = z.infer<typeof eventFormSchema>;

type EventFormProps = {
  initialValues?: Partial<
    Omit<EventFormValues, "startTime" | "endTime" | "lineup">
  > & {
    startTime?: string;
    endTime?: string;
    lineup?: Array<Partial<EventFormValues["lineup"][number]>>;
  };
  mode: "create" | "edit";
  administration?: ReactNode;
  onSubmit: (data: any) => void | Promise<void>;
  onDelete?: () => void;
  readOnly?: boolean;
  onUseAsTemplate?: () => void;
};

const formatToISO = (value: string) =>
  value ? new Date(value).toISOString() : "";

function getDefaultValues(
  values?: EventFormProps["initialValues"],
): EventFormValues {
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
    ticketingMode: values?.externalTicketUrl ? "external" : "spottr",
    externalTicketUrl: values?.externalTicketUrl || "",
    organizerAbsorbsServiceFee: values?.organizerAbsorbsServiceFee ?? false,
    vatPercentage: values?.vatPercentage,
    ticketTypes:
      values?.ticketTypes?.map((ticket) => ({
        id: ticket.id,
        name: ticket.name || "",
        priceRon: ticket.priceRon ?? 0,
        capacity: ticket.capacity ?? 100,
        description: ticket.description || "",
        ticketsSold: ticket.ticketsSold ?? 0,
        startSales: formatToDatetimeLocal(ticket.startSales),
        endSales: formatToDatetimeLocal(ticket.endSales),
      })) || [],
    lineup:
      values?.lineup?.map((artist) => ({
        id: artist.id,
        name: artist.name || "",
        imageUrl: artist.imageUrl || "",
        stage: artist.stage || "",
        performanceTime: artist.performanceTime || "",
        spotifyUrl: artist.spotifyUrl || "",
        isHeadliner: artist.isHeadliner ?? false,
        source: artist.source || "MANUAL",
      })) || [],
  };
}

export default function EventForm({
  mode,
  administration,
  initialValues,
  onSubmit,
  onDelete,
  readOnly = false,
  onUseAsTemplate,
}: EventFormProps) {
  const { t } = useTranslation();
  const [mapsReady, setMapsReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.google?.maps?.places),
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [step, setStep] = useState(0);
  const [section, setSection] = useState<EditorSection>("details");
  const [lineupOpen, setLineupOpen] = useState(false);
  const [validationFailed, setValidationFailed] = useState(false);
  const navigationRef = useRef<HTMLDivElement>(null);
  const isCreate = mode === "create";
  const form = useForm<EventFormValues>({
    resolver: zodResolver(
      eventFormSchema,
    ) as unknown as Resolver<EventFormValues>,
    defaultValues: getDefaultValues(initialValues),
  });

  useEffect(() => {
    form.reset(getDefaultValues(initialValues));
  }, [form, initialValues]);

  useEffect(() => {
    if (window.google?.maps?.places) setMapsReady(true);
  }, []);

  const handleFormSubmit = async (data: EventFormValues) => {
    if (readOnly || data.status === "completed") return;
    const { ticketingMode, ...eventData } = data;
    await onSubmit({
      ...eventData,
      status: data.status,
      startTime: formatToISO(data.startTime),
      endTime: formatToISO(data.endTime),
      publishAt:
        data.status === "scheduled" && data.publishAt
          ? formatToISO(data.publishAt)
          : undefined,
      externalTicketUrl: ticketingMode === "external" ? data.externalTicketUrl : undefined,
      vatPercentage: ticketingMode === "external" ? undefined : data.vatPercentage,
      organizerAbsorbsServiceFee: ticketingMode === "external" ? false : data.organizerAbsorbsServiceFee,
      ticketTypes:
        ticketingMode === "external"
          ? []
          : data.ticketTypes.map(({ ticketsSold, ...ticket }) => ({
              ...ticket,
              startSales: formatToISO(ticket.startSales),
              endSales: formatToISO(ticket.endSales),
            })),
      lineup: data.lineup.map(({ id: _id, ...artist }) => artist),
    });
  };

  const scrollToNavigation = () =>
    navigationRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  const handleInvalid = (errors: FieldErrors<EventFormValues>) => {
    const destination = getErrorDestination(errors, mode);
    if (destination) {
      setStep(destination.step);
      setSection(destination.section);
    }
    if (errors.lineup) setLineupOpen(true);
    setValidationFailed(true);
    scrollToNavigation();
  };
  const goToStep = async (next: number) => {
    if (next > step) {
      const fields =
        step === 0 ? [...basicsFields, "lineup" as const] : scheduleFields;
      if (!(await form.trigger(fields))) {
        if (form.getFieldState("lineup").error) setLineupOpen(true);
        setValidationFailed(true);
        scrollToNavigation();
        return;
      }
    }
    setValidationFailed(false);
    setStep(next);
    scrollToNavigation();
  };
  const { isSubmitting } = form.formState;
  const showBasics = isCreate ? step === 0 : section === "details";
  const showSchedule = isCreate ? step === 1 : section === "details";
  const showTickets = isCreate ? step === 2 : section === "tickets";
  const showPublication = isCreate ? step === 2 : section === "details";
  const steps = ["about", "whenWhere", "access"] as const;
  const sections = ["details", "lineup", "tickets", "admin"] as const;
  const status = form.watch("status");

  return (
    <>
      <div
        ref={navigationRef}
        className="mt-7 scroll-mt-24 border-b border-white/10"
      >
        <nav aria-label={t("eventEditor.navigation")} className="flex gap-2">
          {isCreate
            ? steps.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  disabled={index > step || isSubmitting}
                  aria-current={step === index ? "step" : undefined}
                  onClick={() => void goToStep(index)}
                  className={`flex min-w-0 flex-1 flex-col gap-2 border-b-2 px-1 pb-4 text-left text-xs font-medium transition sm:flex-row sm:items-center sm:gap-3 sm:text-sm ${step === index ? "border-primary text-foreground" : "border-transparent text-muted-foreground disabled:opacity-50"}`}
                >
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${step === index ? "bg-primary text-primary-foreground" : "bg-white/5"}`}
                  >
                    {index < step ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {t(`eventEditor.${label}`)}
                </button>
              ))
            : sections
                .filter(
                  (item) => item !== "admin" || administration || onDelete,
                )
                .map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-current={section === item ? "page" : undefined}
                    disabled={isSubmitting}
                    onClick={() => {
                      setSection(item);
                      setValidationFailed(false);
                    }}
                    className={`min-w-0 flex-1 border-b-2 px-1 pb-4 text-xs font-medium transition sm:text-sm ${section === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                  >
                    {t(`eventEditor.${item}`)}
                  </button>
                ))}
        </nav>
      </div>
      {validationFailed && (
        <p role="alert" className="mt-5 text-sm text-red-400">
          {t("eventEditor.fixErrors")}
        </p>
      )}
      <form
        id="event-editor-form"
        hidden={!isCreate && section === "admin"}
        onSubmit={(event) => {
          if (isCreate && step < 2) {
            event.preventDefault();
            void goToStep(step + 1);
            return;
          }
          void form.handleSubmit(handleFormSubmit, handleInvalid)(event);
        }}
        className="pt-8"
      >
        <Script
          id="google-maps-places"
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setMapsReady(true)}
          onReady={() => setMapsReady(true)}
        />
        <fieldset
          disabled={isSubmitting}
          className="[&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-70 [&_input:disabled]:cursor-not-allowed [&_textarea:disabled]:cursor-not-allowed"
        >
          <fieldset disabled={readOnly} hidden={!showBasics}>
            <EventDetailsSection
              form={form}
              mapsReady={mapsReady}
              section="basics"
            />
          </fieldset>
          <fieldset
            disabled={readOnly}
            hidden={!showSchedule}
            className={
              !isCreate ? "mt-10 border-t border-white/10 pt-8" : undefined
            }
          >
            <EventDetailsSection
              form={form}
              mapsReady={mapsReady}
              section="schedule"
            />
          </fieldset>
          <div
            hidden={isCreate ? step !== 0 : section !== "lineup"}
            className={
              isCreate ? "mt-8 border-t border-white/10 pt-6" : undefined
            }
          >
            {isCreate && (
              <button
                type="button"
                aria-expanded={lineupOpen}
                aria-controls="event-lineup"
                onClick={() => setLineupOpen(!lineupOpen)}
                className="flex w-full items-center justify-between gap-3 py-2 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold">
                    {t("eventEditor.addLineup")}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {t("eventEditor.optional")}
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition ${lineupOpen ? "rotate-180" : ""}`}
                />
              </button>
            )}
            <div
              id="event-lineup"
              hidden={isCreate && !lineupOpen}
              className={isCreate ? "pt-5" : undefined}
            >
              <LineupSection
                form={form}
                readOnly={readOnly}
                showHeading={!isCreate}
              />
            </div>
          </div>
          <div hidden={!showTickets}>
            <TicketTypesSection form={form} readOnly={readOnly} />
          </div>
          <fieldset
            disabled={readOnly}
            hidden={!showPublication}
            className="mt-10"
          >
            <EventPublicationSection form={form} showSummary={isCreate} />
          </fieldset>
        </fieldset>
      </form>
      {(!readOnly || onUseAsTemplate) && (isCreate || section !== "admin") && (
        <div className="mt-8 border-t border-white/10 pt-6">
          <div className="flex items-center gap-3">
            {isCreate && step > 0 && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void goToStep(step - 1)}
                className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-white/5"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("common.back")}
              </button>
            )}
            {!isCreate && !readOnly && (
              <span className="hidden flex-1 text-xs text-muted-foreground sm:block">
                {t(
                  form.formState.isDirty
                    ? "eventEditor.unsaved"
                    : "eventEditor.editHint",
                )}
              </span>
            )}
            {readOnly ? (
              <button
                type="button"
                onClick={onUseAsTemplate}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                <Copy className="h-4 w-4" />
                {t("eventForm.useAsTemplate")}
              </button>
            ) : (
              <button
                type="submit"
                form="event-editor-form"
                disabled={isSubmitting}
                className="ml-auto inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60 sm:flex-none"
              >
                {isSubmitting && (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                )}
                {isSubmitting
                  ? t("eventEditor.saving")
                  : isCreate && step < 2
                    ? t("common.next")
                    : !isCreate
                      ? t("eventForm.saveChanges")
                      : t(
                          status === "published"
                            ? "eventEditor.publish"
                            : status === "scheduled"
                              ? "eventEditor.schedule"
                              : "eventEditor.saveDraft",
                        )}
                {isCreate && step < 2 && <ArrowRight className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      )}
      {!isCreate && (
        <div hidden={section !== "admin"} className="pt-8">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("eventEditor.admin")}
          </h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            {t("eventEditor.adminHint")}
          </p>
          {administration}
          {!readOnly && onDelete && (
            <div className="mt-8 border-t border-white/10 pt-6">
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                {t("eventForm.deleteEvent")}
              </button>
            </div>
          )}
        </div>
      )}
      {showDeleteModal && (
        <DeleteEventDialog
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={() => {
            setShowDeleteModal(false);
            onDelete?.();
          }}
        />
      )}
    </>
  );
}
