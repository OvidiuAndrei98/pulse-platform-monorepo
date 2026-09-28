import { MapPin, Music2, Tags } from "lucide-react";
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
  section,
}: {
  form: UseFormReturn<EventFormValues>;
  mapsReady: boolean;
  section: "basics" | "schedule";
}) {
  const { t } = useTranslation();
  const {
    register,
    setValue,
    watch,
    formState: { errors },
  } = form;
  const locationName = watch("locationName");

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {t(`eventEditor.${section}Title`)}
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t(`eventEditor.${section}Hint`)}
        </p>
      </div>
      {section === "basics" && (
        <>
          <FormField label={t("eventForm.title")} error={errors.title?.message}>
            <input
              {...register("title")}
              placeholder={t("eventForm.titlePlaceholder")}
              className={eventInputClass}
            />
          </FormField>
          <FormField
            label={t("eventForm.image")}
            error={errors.bannerUrl?.message}
          >
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                options={eventVibes.map((vibe) => ({
                  value: vibe,
                  label: vibe,
                }))}
                placeholder={t("eventForm.vibePlaceholder")}
                icon={Music2}
                onChange={(vibe) =>
                  setValue("vibe", vibe, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              />
              <input type="hidden" {...register("vibe")} />
            </FormField>
          </div>
          <FormField
            label={t("eventForm.description")}
            error={errors.description?.message}
          >
            <textarea
              {...register("description")}
              placeholder={t("eventForm.descriptionPlaceholder")}
              rows={5}
              className={`${eventInputClass} resize-y rounded-xl`}
            />
          </FormField>
        </>
      )}
      {section === "schedule" && (
        <>
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
                options={eventCities.map((city) => ({
                  value: city,
                  label: city,
                }))}
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
        </>
      )}
    </section>
  );
}
