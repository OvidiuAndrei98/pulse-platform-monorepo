"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Minus,
  Plus,
  Trash2,
  Calendar,
  MapPin,
  Ticket as TicketIcon,
  AlertTriangle,
} from "lucide-react";
import Script from "next/dist/client/script";
import {
  PlaceResult,
  PlacesAutocomplete,
} from "@/components/PlacesAutocomplete";
import { eventCategories } from "@/core/mappers";

export const ticketTypeSchema = z
  .object({
    id: z
      .string()
      .uuid("ID-ul biletului trebuie să fie un UUID valid")
      .optional()
      .or(z.literal("").transform(() => undefined))
      .or(z.null().transform(() => undefined)),
    name: z.string().min(2, "Numele biletului este prea scurt"),
    priceRon: z.coerce.number().min(0, "Prețul nu poate fi negativ"),
    capacity: z.coerce
      .number()
      .min(1, "Capacitatea trebuie să fie cel puțin 1"),
    description: z.string().max(1000, "Descrierea este prea lungă").optional(),
    startSales: z.string().min(1, "Data de start este obligatorie"),
    endSales: z.string().min(1, "Data de final este obligatorie"),
    ticketsSold: z.number().optional(),
  })
  .refine((data) => new Date(data.endSales) > new Date(data.startSales), {
    message: "Data de final a vânzărilor trebuie să fie după data de start",
    path: ["endSales"],
  });

export const eventFormSchema = z
  .object({
    title: z.string().min(3, "Titlul trebuie să aibă cel puțin 3 caractere"),
    category: z.string().min(1, "Selectează o categorie"),
    startTime: z.string().min(1, "Data de început este obligatorie"),
    endTime: z.string().min(1, "Data de final este obligatorie"),
    locationName: z.string().min(1, "Locația este obligatorie"),
    latitude: z.coerce.number({
      error: "Latitudinea este obligatorie",
    }),
    longitude: z.coerce.number({
      error: "Longitudinea este obligatorie",
    }),
    googlePlaceId: z.string().min(1, "Google Place ID este obligatoriu"),
    description: z
      .string()
      .min(10, "Descrierea trebuie să aibă cel puțin 10 caractere"),
    bannerUrl: z
      .string()
      .url("Introduceți un URL valid")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    status: z.enum(["draft", "published"]).default("draft"),
    ticketTypes: z.array(ticketTypeSchema),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message:
      "Data de final a evenimentului trebuie să fie după data de început",
    path: ["endTime"],
  });

type EventFormValues = z.infer<typeof eventFormSchema>;

type EventFormProps = {
  initialValues?: Partial<Omit<EventFormValues, "startTime" | "endTime">> & {
    startTime?: string;
    endTime?: string;
  };
  onSubmit: (data: any) => void;
  onDelete?: () => void; // Callback adăugat pentru ștergerea evenimentului
};

const inputCls =
  "w-full rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground/40 focus:border-primary/30 focus:bg-white/[0.04] color-scheme-dark";

const formatToDatetimeLocal = (isoString?: string) => {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 16);
  } catch {
    return "";
  }
};

const formatToISO = (localDateTimeString: string) => {
  if (!localDateTimeString) return "";
  const date = new Date(localDateTimeString);
  return date.toISOString();
};

export default function EventForm({
  initialValues,
  onSubmit,
  onDelete,
}: EventFormProps) {
  const [mapsReady, setMapsReady] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isEditMode = Boolean(
    initialValues && Object.keys(initialValues).length > 0,
  );

  const getMappedValues = (values?: typeof initialValues) => ({
    title: values?.title || "",
    category: values?.category || eventCategories[0] || "",
    startTime: values?.startTime ? formatToDatetimeLocal(values.startTime) : "",
    endTime: values?.endTime ? formatToDatetimeLocal(values.endTime) : "",
    locationName: values?.locationName || "",
    latitude: values?.latitude ?? 0,
    longitude: values?.longitude ?? 0,
    googlePlaceId: values?.googlePlaceId || "",
    description: values?.description || "",
    bannerUrl: values?.bannerUrl || "",
    status: values?.status || "draft",
    ticketTypes:
      values?.ticketTypes?.map((t) => ({
        id: t.id,
        name: t.name || "",
        priceRon: t.priceRon ?? 0,
        capacity: t.capacity ?? 100,
        description: t.description || "",
        ticketsSold: t.ticketsSold ?? 0,
        startSales: formatToDatetimeLocal(t.startSales as string),
        endSales: formatToDatetimeLocal(t.endSales as string),
      })) || [],
  });

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(eventFormSchema),
    defaultValues: getMappedValues(initialValues),
  });

  useEffect(() => {
    if (isEditMode) {
      reset(getMappedValues(initialValues));
    }
  }, [initialValues, reset, isEditMode]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "ticketTypes",
  });

  const ticketTypesValues = watch("ticketTypes");
  const currentStatus = watch("status");

  const handleFormSubmit = (formData: EventFormValues) => {
    const parsedPayload = {
      ...formData,
      startTime: formatToISO(formData.startTime),
      endTime: formatToISO(formData.endTime),
      ticketTypes: formData.ticketTypes.map(({ ticketsSold, ...ticket }) => ({
        ...ticket,
        startSales: formatToISO(ticket.startSales),
        endSales: formatToISO(ticket.endSales),
      })),
    };
    onSubmit(parsedPayload);
  };

  return (
    <>
      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
          strategy="afterInteractive"
          onLoad={() => setMapsReady(true)}
        />

        {/* Detalii Eveniment */}
        <section className="space-y-4 rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/80 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Detalii Eveniment
          </h2>

          <Field label="Titlu" error={errors.title?.message}>
            <input
              {...register("title")}
              placeholder="Numele evenimentului"
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Categorie" error={errors.category?.message}>
              <select {...register("category")} className={inputCls}>
                {eventCategories.map((c) => (
                  <option
                    key={c}
                    value={c}
                    className="bg-neutral-900 text-white"
                  >
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Stare Eveniment">
              <div className="grid grid-cols-2 gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] p-1 h-[42px]">
                <button
                  type="button"
                  onClick={() => setValue("status", "draft")}
                  className={`rounded-full text-xs font-medium transition ${
                    currentStatus === "draft"
                      ? "bg-white/10 text-white"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  Ciornă (Draft)
                </button>
                <button
                  type="button"
                  onClick={() => setValue("status", "published")}
                  className={`rounded-full text-xs font-medium transition ${
                    currentStatus === "published"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  Publicat
                </button>
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Data începere / desfășurare"
              error={errors.startTime?.message}
            >
              <input
                type="datetime-local"
                {...register("startTime")}
                className={inputCls}
              />
            </Field>
            <Field
              label="Durată / ora închiderii"
              error={errors.endTime?.message}
            >
              <input
                type="datetime-local"
                {...register("endTime")}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Locație" error={errors.locationName?.message}>
            <PlacesAutocomplete
              onSelect={(location: PlaceResult) => {
                setValue("locationName", location.name, {
                  shouldValidate: true,
                });
                setValue("latitude", location.lat);
                setValue("longitude", location.lng);
                setValue("googlePlaceId", location.placeId);
              }}
              ready={mapsReady}
            />
            <input type="hidden" {...register("locationName")} />
            <input type="hidden" {...register("latitude")} />
            <input type="hidden" {...register("longitude")} />
            <input type="hidden" {...register("googlePlaceId")} />
          </Field>

          <Field label="Descriere" error={errors.description?.message}>
            <textarea
              {...register("description")}
              placeholder="Descrie evenimentul, DJ-ii, atmosfera..."
              rows={4}
              className="w-full resize-none rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-primary/30 focus:bg-white/[0.04]"
            />
          </Field>

          <Field label="Imagine (URL)" error={errors.bannerUrl?.message}>
            <input
              {...register("bannerUrl")}
              placeholder="https://..."
              className={inputCls}
            />
          </Field>
        </section>

        {/* Secțiune Bilete */}
        <section className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/80 flex items-center gap-2">
                <TicketIcon className="h-4 w-4 text-primary" /> Tipuri de bilete
              </h2>
              <p className="text-[11px] text-muted-foreground/50 mt-0.5 max-w-[500px]">
                Adaugă tipuri de bilete pentru evenimentul tău. Poți seta
                prețul, stocul și perioada de vânzare pentru fiecare tip sau
                poate fi gratuit.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                append({
                  name: "",
                  priceRon: 0,
                  capacity: 50,
                  description: "",
                  startSales: "",
                  endSales: "",
                })
              }
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Adaugă tip
            </button>
          </div>

          {errors.ticketTypes?.message && (
            <p className="mt-2 text-xs text-red-400 font-medium">
              {errors.ticketTypes.message}
            </p>
          )}

          <div className="mt-4 space-y-3">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-2xl border border-white/[0.05] bg-white/[0.01] p-4 relative"
              >
                <input type="hidden" {...register(`ticketTypes.${index}.id`)} />

                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <input
                      {...register(`ticketTypes.${index}.name`)}
                      placeholder="Nume (ex: General Admission, VIP)"
                      className="w-full rounded-full border border-white/[0.06] bg-white/[0.02] px-3.5 py-2 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-primary/30 focus:bg-white/[0.04]"
                    />
                    {errors.ticketTypes?.[index]?.name?.message && (
                      <p className="mt-1 px-2 text-[11px] text-red-400">
                        {errors.ticketTypes[index].name.message}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="shrink-0 rounded-full p-2 text-muted-foreground/60 hover:bg-white/5 hover:text-red-400 transition"
                    aria-label="Șterge tip bilet"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field
                    label="Preț (RON)"
                    compact
                    error={errors.ticketTypes?.[index]?.priceRon?.message}
                  >
                    <StepperInput
                      value={
                        (ticketTypesValues?.[index]?.priceRon as number) ?? 0
                      }
                      onChange={(v) =>
                        setValue(`ticketTypes.${index}.priceRon`, v, {
                          shouldValidate: true,
                        })
                      }
                      step={10}
                      min={0}
                    />
                  </Field>
                  <Field
                    label="Stoc maximum"
                    compact
                    error={errors.ticketTypes?.[index]?.capacity?.message}
                  >
                    <StepperInput
                      value={
                        (ticketTypesValues?.[index]?.capacity as number) ?? 0
                      }
                      onChange={(v) =>
                        setValue(`ticketTypes.${index}.capacity`, v, {
                          shouldValidate: true,
                        })
                      }
                      step={10}
                      min={1}
                    />
                  </Field>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field
                    label="Start Vânzare"
                    compact
                    error={errors.ticketTypes?.[index]?.startSales?.message}
                  >
                    <input
                      type="datetime-local"
                      {...register(`ticketTypes.${index}.startSales`)}
                      className={inputCls}
                    />
                  </Field>
                  <Field
                    label="End Vânzare"
                    compact
                    error={errors.ticketTypes?.[index]?.endSales?.message}
                  >
                    <input
                      type="datetime-local"
                      {...register(`ticketTypes.${index}.endSales`)}
                      className={inputCls}
                    />
                  </Field>
                </div>

                <div className="mt-3">
                  <input
                    {...register(`ticketTypes.${index}.description`)}
                    placeholder="Descriere scurtă opțională (ex. Acces în zona de backstage)"
                    className={inputCls}
                  />
                  {errors.ticketTypes?.[index]?.description?.message && (
                    <p className="mt-1 px-2 text-[11px] text-red-400">
                      {errors.ticketTypes[index].description.message}
                    </p>
                  )}
                </div>

                {field.ticketsSold !== undefined && field.ticketsSold > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground/60 font-medium bg-white/[0.02] inline-block px-2.5 py-1 rounded-full border border-white/[0.04]">
                    Vândute până acum:{" "}
                    <span className="text-white font-semibold">
                      {field.ticketsSold}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Butoane Salvare & Ștergere */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {isEditMode && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-5 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition active:scale-[0.99]"
            >
              <Trash2 className="h-4 w-4" />
              Șterge Evenimentul
            </button>
          )}

          <button
            type="submit"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black shadow-sm hover:opacity-95 transition active:scale-[0.99]"
          >
            {isEditMode ? "Salvează modificările" : "Creează evenimentul"}
          </button>
        </div>
      </form>

      {/* Modal Confirmare Ștergere */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <div className="rounded-full bg-red-500/10 p-2.5">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-white">
                Ștergi evenimentul?
              </h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Ești sigur că vrei să ștergi acest eveniment? Această acțiune este
              ireversibilă și va elimina definitiv toate datele și biletele
              asociate.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-full border border-white/10 bg-white/5 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition"
              >
                Anulează
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  if (onDelete) onDelete();
                }}
                className="flex-1 rounded-full bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-700 transition"
              >
                Da, Șterge
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  compact,
  error,
  children,
}: {
  label: string;
  compact?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full">
      <div className="flex justify-between items-center px-1">
        <label
          className={
            "block font-semibold uppercase tracking-wide text-muted-foreground/70 " +
            (compact ? "text-[9px]" : "text-[10px]")
          }
        >
          {label}
        </label>
        {error && (
          <span className="text-[10px] text-red-400 lowercase font-medium">
            {error}
          </span>
        )}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function StepperInput({
  value,
  onChange,
  step = 1,
  min = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1 h-[42px]">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        className="w-full bg-transparent text-center text-sm font-medium outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + step)}
        className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
