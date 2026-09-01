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
import { useTranslation } from "react-i18next";

export function EventDetailsSection({
  form,
  mapsReady,
}: {
  form: UseFormReturn<EventFormValues>;
  mapsReady: boolean;
}) {
  const { t } = useTranslation();
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const currentStatus = watch("status");
  const statuses =
    currentStatus === "completed"
      ? (["completed"] as const)
      : (["draft", "scheduled", "published"] as const);
  const locationName = watch("locationName");

  return (
    <section className="space-y-4 rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground/80">
        <Calendar className="h-4 w-4 text-primary" /> {t("eventForm.details")}
      </h2>
      <FormField label={t("eventForm.image")} error={errors.bannerUrl?.message}>
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
      <FormField label={t("eventForm.title")} error={errors.title?.message}>
        <input
          {...register("title")}
          placeholder={t("eventForm.titlePlaceholder")}
          className={eventInputClass}
        />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField
          label={t("eventForm.category")}
          error={errors.category?.message}
        >
          <ThemedSelect
            value={watch("category")}
            options={eventCategories.map((category) => ({
              value: category,
              label: category,
            }))}
            placeholder={t("eventForm.categoryPlaceholder")}
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
        <FormField label={t("filters.vibe")} error={errors.vibe?.message}>
          <ThemedSelect
            value={watch("vibe")}
            options={eventVibes.map((vibe) => ({ value: vibe, label: vibe }))}
            placeholder={t("eventForm.vibePlaceholder")}
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
        <FormField label={t("eventForm.eventStatus")}>
          <div
            className={`grid h-[42px] gap-1 rounded-full border border-white/[0.06] bg-white/[0.02] p-1 ${currentStatus === "completed" ? "grid-cols-1" : "grid-cols-3"}`}
          >
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setValue("status", status)}
                className={`rounded-full text-xs font-medium transition ${currentStatus === status ? (status === "published" ? "bg-primary text-primary-foreground" : "bg-white/10 text-white") : "text-muted-foreground hover:text-white"}`}
              >
                {status === "completed"
                  ? t("organizerEvents.completed")
                  : t(`eventForm.${status}`)}
              </button>
            ))}
          </div>
        </FormField>
      </div>
      {currentStatus === "scheduled" && (
        <FormField
          label={t("eventForm.publishAt")}
          error={errors.publishAt?.message}
        >
          <DateTimePicker
            value={watch("publishAt") || ""}
            onChange={(publishAt) =>
              setValue("publishAt", publishAt, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            placeholder={t("eventForm.choosePublishTime")}
          />
          <input type="hidden" {...register("publishAt")} />
        </FormField>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label={t("eventForm.startDate")}
          error={errors.startTime?.message}
        >
          <DateTimePicker
            value={watch("startTime")}
            onChange={(startTime) =>
              setValue("startTime", startTime, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            placeholder={t("eventForm.chooseStart")}
          />
          <input type="hidden" {...register("startTime")} />
        </FormField>
        <FormField
          label={t("eventForm.endDate")}
          error={errors.endTime?.message}
        >
          <DateTimePicker
            value={watch("endTime")}
            onChange={(endTime) =>
              setValue("endTime", endTime, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            placeholder={t("eventForm.chooseEnd")}
          />
          <input type="hidden" {...register("endTime")} />
        </FormField>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <FormField
          label={t("eventForm.venue")}
          error={errors.locationName?.message}
        >
          <div className="relative">
            <MapPin
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary"
            />
            <PlacesAutocomplete
              ready={mapsReady}
              value={locationName}
              onChange={(value) => {
                setValue("locationName", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                });
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
        <FormField label={t("eventForm.city")} error={errors.city?.message}>
          <ThemedSelect
            value={watch("city")}
            options={eventCities.map((city) => ({ value: city, label: city }))}
            placeholder={t("eventForm.cityPlaceholder")}
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
      <FormField
        label={t("eventForm.description")}
        error={errors.description?.message}
      >
        <textarea
          {...register("description")}
          placeholder={t("eventForm.descriptionPlaceholder")}
          rows={4}
          className="w-full  rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/40 focus:border-primary/30 focus:bg-white/[0.04]"
        />
      </FormField>
    </section>
  );
}
