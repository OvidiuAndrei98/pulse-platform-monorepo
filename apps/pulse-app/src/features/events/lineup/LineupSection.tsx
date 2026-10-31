"use client";

import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UseFormReturn } from "react-hook-form";
import type { EventFormValues } from "@/app/dashboard/components/EventsForm";
import { AddArtistForm, type LineupArtistInput } from "./AddArtistForm";
import { TimePicker } from "@/features/events/form/DateTimePicker";
import {Input as UIInput} from '@/components/ui/Field';

export function LineupSection({
  form,
  readOnly = false,
  showHeading = true,
}: {
  form: UseFormReturn<EventFormValues>;
  readOnly?: boolean;
  showHeading?: boolean;
}) {
  const { t } = useTranslation();
  const lineup = form.watch("lineup") ?? [];
  const update = (index: number, patch: Partial<LineupArtistInput>) => {
    const nextLineup = lineup.map((artist, artistIndex) =>
      artistIndex === index ? { ...artist, ...patch } : artist,
    );
    if (patch.performanceTime !== undefined) {
      nextLineup.sort((first, second) =>
        (first.performanceTime || "99:99").localeCompare(
          second.performanceTime || "99:99",
        ),
      );
    }
    form.setValue("lineup", nextLineup, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <section>
      {showHeading && (
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              {t("lineup.manageTitle")}
            </h2>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
              {t("lineup.manageHint")}
            </p>
          </div>
        </div>
      )}
      {lineup.length > 0 && (
        <fieldset disabled={readOnly} className="mt-4 divide-y divide-white/10">
          {lineup.map((artist, index) => (
            <div
              key={`${artist.id ?? artist.name}-${index}`}
              className="flex items-center gap-3 py-5"
            >
              {artist.imageUrl ? (
                <img
                  src={artist.imageUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-full border border-primary/25 bg-primary/10" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{artist.name}</p>
                {form.formState.errors.lineup?.[index] && (
                  <p role="alert" className="mt-1 text-xs text-red-400">
                    {[
                      "name",
                      "stage",
                      "performanceTime",
                      "imageUrl",
                      "spotifyUrl",
                    ]
                      .map(
                        (key) =>
                          form.getFieldState(
                            `lineup.${index}.${key as "name" | "stage" | "performanceTime" | "imageUrl" | "spotifyUrl"}`,
                          ).error?.message,
                      )
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <UIInput
                    value={artist.stage}
                    onChange={(event) =>
                      update(index, { stage: event.target.value })
                    }
                    placeholder={t("lineup.stage")}
                    className="h-8 min-w-0 max-w-28"
                  />
                  <div className="w-28">
                    <TimePicker
                      compact
                      value={artist.performanceTime}
                      onChange={(performanceTime) =>
                        update(index, { performanceTime })
                      }
                    />
                  </div>
                  <label className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/[0.1] bg-black/15 px-2 text-xs">
                    <input
                      type="checkbox"
                      checked={artist.isHeadliner}
                      onChange={(event) =>
                        update(index, { isHeadliner: event.target.checked })
                      }
                      className="accent-primary"
                    />{" "}
                    {t("lineup.headliner")}
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  form.setValue(
                    "lineup",
                    lineup.filter((_, artistIndex) => artistIndex !== index),
                    { shouldDirty: true },
                  )
                }
                aria-label={t("lineup.removeArtist", { name: artist.name })}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </fieldset>
      )}
      {!readOnly && (
        <div
          className={
            lineup.length > 0
              ? "mt-5 border-t border-white/10 pt-6"
              : showHeading
                ? "mt-6"
                : undefined
          }
        >
          <AddArtistForm
            onAdd={(artist) =>
              form.setValue("lineup", [...lineup, artist], {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </div>
      )}
    </section>
  );
}
