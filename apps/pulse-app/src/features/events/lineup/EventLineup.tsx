"use client";

import { Music2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Artist } from "@/core/DataProvider";

export function EventLineup({ artists }: { artists?: readonly Artist[] }) {
  const { t } = useTranslation();
  if (!artists?.length) return null;

  return (
    <section aria-label={t("lineup.aria")} className="pt-2">
      <p className="text-sm font-semibold text-foreground/90">
        {t("lineup.title")}
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {artists.map((artist) => (
          <div
            key={artist.id}
            className={`flex min-h-16 items-center gap-3 p-2 rounded-xl overflow-hidden ${
              artist.isHeadliner ? "bg-primary/[0.035]" : ""
            }`}
          >
            <ArtistAvatar artist={artist} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {artist.name}
                </p>
                {artist.isHeadliner && (
                  <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-primary">
                    {t("lineup.headliner")}
                  </span>
                )}
              </div>
              {(artist.stage || artist.performanceTime) && (
                <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {[artist.stage, artist.performanceTime]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            {artist.spotifyUrl && (
              <a
                href={artist.spotifyUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={t("lineup.openSpotify", { name: artist.name })}
                title={t("lineup.spotify")}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Music2 className="h-4 w-4" />
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ArtistAvatar({ artist }: { artist: Artist }) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = artist.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  if (!artist.imageUrl || imageFailed) {
    return (
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 text-xs font-bold text-primary">
        {initials || <Music2 className="h-4 w-4" />}
      </div>
    );
  }

  return (
    <img
      src={artist.imageUrl}
      alt=""
      onError={() => setImageFailed(true)}
      className={`h-12 w-12 shrink-0 rounded-full object-cover ${
        artist.isHeadliner
          ? "ring-1 ring-primary ring-offset-2 ring-offset-background"
          : ""
      }`}
    />
  );
}
