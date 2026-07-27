"use client";

import { GripVertical, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UseFormReturn } from "react-hook-form";
import type { EventFormValues } from "@/app/dashboard/components/EventsForm";
import { AddArtistForm, type LineupArtistInput } from "./AddArtistForm";

export function LineupSection({ form }: { form: UseFormReturn<EventFormValues> }) {
  const { t } = useTranslation();
  const lineup = form.watch("lineup") ?? [];
  const update = (index: number, patch: Partial<LineupArtistInput>) => {
    form.setValue(
      "lineup",
      lineup.map((artist, artistIndex) =>
        artistIndex === index ? { ...artist, ...patch } : artist,
      ),
      { shouldDirty: true },
    );
  };

  return (
    <section className="border-t border-white/10 pt-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{t("lineup.manageTitle")}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {t("lineup.manageHint")}
        </p>
      </div>
      <div className="space-y-2">
        {lineup.map((artist, index) => (
          <div
            key={`${artist.id ?? artist.name}-${index}`}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-surface/60 p-3"
          >
            <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
            {artist.imageUrl ? (
              <img src={artist.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-full border border-primary/25 bg-primary/10" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{artist.name}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <input value={artist.stage} onChange={(event) => update(index, { stage: event.target.value })} placeholder={t("lineup.stage")} className="h-8 min-w-0 max-w-28 rounded-md border border-white/10 bg-background px-2 text-xs outline-none focus:border-primary/60" />
                <input value={artist.performanceTime} onChange={(event) => update(index, { performanceTime: event.target.value })} placeholder={t("lineup.time")} className="h-8 min-w-0 max-w-24 rounded-md border border-white/10 bg-background px-2 text-xs outline-none focus:border-primary/60" />
                <label className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2 text-xs"><input type="checkbox" checked={artist.isHeadliner} onChange={(event) => update(index, { isHeadliner: event.target.checked })} className="accent-primary" /> {t("lineup.headliner")}</label>
              </div>
            </div>
            <button type="button" onClick={() => form.setValue("lineup", lineup.filter((_, artistIndex) => artistIndex !== index), { shouldDirty: true })} aria-label={t("lineup.removeArtist", { name: artist.name })} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-3"><AddArtistForm onAdd={(artist) => form.setValue("lineup", [...lineup, artist], { shouldDirty: true })} /></div>
    </section>
  );
}
