import { Calendar, MapPin, Sparkles, Tags } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import {
  PlacesAutocomplete,
  PlaceResult,
} from "@/components/PlacesAutocomplete";
import { eventCategories } from "@/core/mappers";
import { eventCities, eventVibes } from "@/features/events/constants";
import { EventFormValues } from "@/app/dashboard/components/EventsForm";
import { ThemedSelect } from "@/features/events/form/ThemedSelect";
import { DateTimePicker } from "@/features/events/form/DateTimePicker";
import { eventInputClass, FormField } from "@/features/events/form/FormField";
import { EventBannerUpload } from "@/features/events/form/EventBannerUpload";

export function EventDetailsSection({
  form,
  mapsReady,
}: {
  form: UseFormReturn<EventFormValues>;
  mapsReady: boolean;
}) {
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const currentStatus = watch("status");
  const locationName = watch("locationName");

  return (
    <section className="space-y-4 rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground/80">
        <Calendar className="h-4 w-4 text-primary" /> Detalii eveniment
      </h2>
      <FormField label="Titlu" error={errors.title?.message}>
        <input
          {...register("title")}
          placeholder="Numele evenimentului"
          className={eventInputClass}
        />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField label="Categorie" error={errors.category?.message}>
          <ThemedSelect
            value={watch("category")}
            options={eventCategories.map((category) => ({
              value: category,
              label: category,
            }))}
            placeholder="Alege categoria"
            icon={Tags}
            onChange={(category) =>
              setValue("category", category, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
          />
          <input type="hidden" {...register("category")} />
        </FormField>
        <FormField label="Vibe" error={errors.vibe?.message}>
          <ThemedSelect
            value={watch("vibe")}
            options={eventVibes.map((vibe) => ({ value: vibe, label: vibe }))}
            placeholder="Alege vibe-ul"
            icon={Sparkles}
            onChange={(vibe) =>
              setValue("vibe", vibe, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
          />
          <input type="hidden" {...register("vibe")} />
        </FormField>
        <FormField label="Stare eveniment">
          <div className="grid h-[42px] grid-cols-2 gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] p-1">
            {(["draft", "published"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setValue("status", status)}
                className={`rounded-full text-xs font-medium transition ${currentStatus === status ? (status === "published" ? "bg-primary text-primary-foreground" : "bg-white/10 text-white") : "text-muted-foreground hover:text-white"}`}
              >
                {status === "draft" ? "Ciorna" : "Publicat"}
              </button>
            ))}
          </div>
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Data inceperii" error={errors.startTime?.message}>
          <DateTimePicker
            value={watch("startTime")}
            onChange={(startTime) =>
              setValue("startTime", startTime, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            placeholder="Alege inceputul"
          />
          <input type="hidden" {...register("startTime")} />
        </FormField>
        <FormField label="Data finalului" error={errors.endTime?.message}>
          <DateTimePicker
            value={watch("endTime")}
            onChange={(endTime) =>
              setValue("endTime", endTime, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            placeholder="Alege finalul"
          />
          <input type="hidden" {...register("endTime")} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <FormField label="Locatie" error={errors.locationName?.message}>
          <div className="relative">
            <MapPin
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary"
            />
            <PlacesAutocomplete
              ready={mapsReady}
              value={locationName}
              onChange={(value) => {
                setValue("locationName", value, { shouldDirty: true, shouldValidate: true });
                setValue("googlePlaceId", "", { shouldDirty: true });
              }}
              className={`${eventInputClass} pl-10`}
              onSelect={(location: PlaceResult) => {
                setValue("locationName", location.name, {
                  shouldValidate: true,
                });
                setValue("latitude", location.lat);
                setValue("longitude", location.lng);
                setValue("googlePlaceId", location.placeId);
              }}
            />
          </div>
          <input type="hidden" {...register("locationName")} />
          <input type="hidden" {...register("latitude")} />
          <input type="hidden" {...register("longitude")} />
          <input type="hidden" {...register("googlePlaceId")} />
        </FormField>
        <FormField label="Oras" error={errors.city?.message}>
          <ThemedSelect
            value={watch("city")}
            options={eventCities.map((city) => ({ value: city, label: city }))}
            placeholder="Alege orasul"
            icon={MapPin}
            onChange={(city) =>
              setValue("city", city, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
          />
          <input type="hidden" {...register("city")} />
        </FormField>
      </div>
      <FormField label="Descriere" error={errors.description?.message}>
        <textarea
          {...register("description")}
          placeholder="Descrie evenimentul, DJ-ii, atmosfera..."
          rows={4}
          className="w-full resize-none rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-primary/30 focus:bg-white/[0.04]"
        />
      </FormField>
      <FormField label="Imagine eveniment" error={errors.bannerUrl?.message}>
        <EventBannerUpload
          value={watch("bannerUrl")}
          onChange={(bannerUrl) =>
            setValue("bannerUrl", bannerUrl ?? "", {
              shouldValidate: true,
              shouldDirty: true,
            })
          }
        />
        <input type="hidden" {...register("bannerUrl")} />
      </FormField>
    </section>
  );
}
