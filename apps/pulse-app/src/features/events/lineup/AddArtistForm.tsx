"use client";

import {
  Camera,
  Check,
  ChevronDown,
  Link2,
  LoaderCircle,
  Music2,
  PenLine,
  Search,
  Star,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PublicEventsService, type SpotifyArtist } from "@/core/DataProvider";
import { TimePicker } from "@/features/events/form/DateTimePicker";
import { eventInputClass } from "@/features/events/form/FormField";

export type LineupArtistInput = {
  id?: string;
  name: string;
  imageUrl: string;
  stage: string;
  performanceTime: string;
  spotifyUrl: string;
  isHeadliner: boolean;
  source: "SPOTIFY" | "MANUAL";
};

const emptyArtist = (): LineupArtistInput => ({
  name: "",
  imageUrl: "",
  stage: "",
  performanceTime: "",
  spotifyUrl: "",
  isHeadliner: false,
  source: "MANUAL",
});

export function AddArtistForm({
  onAdd,
}: {
  onAdd: (artist: LineupArtistInput) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"spotify" | "manual">("spotify");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [artist, setArtist] = useState<LineupArtistInput>(emptyArtist);
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImageFailed(false);
  }, [artist.imageUrl]);

  useEffect(() => {
    const value = query.trim();
    if (mode !== "spotify" || artist.name || value.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      PublicEventsService.searchSpotifyArtists(value)
        .then((items) => active && setResults(items))
        .catch(() => active && setResults([]))
        .finally(() => active && setSearching(false));
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [mode, query, artist.name]);

  const reset = () => {
    setArtist(emptyArtist());
    setQuery("");
    setResults([]);
    setUploadError("");
  };
  const selectSpotifyArtist = (result: SpotifyArtist) => {
    setArtist({
      ...emptyArtist(),
      name: result.name,
      imageUrl: result.imageUrl || "",
      spotifyUrl: result.spotifyUrl || "",
      source: "SPOTIFY",
    });
    setResults([]);
  };
  const submit = () => {
    if (!artist.name.trim() || uploading) return;
    onAdd({ ...artist, name: artist.name.trim() });
    reset();
  };
  const uploadImage = async (file?: File) => {
    if (!file) return;
    setUploadError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setUploadError(t("media.invalidImage"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError(t("media.imageTooLarge"));
      return;
    }
    setUploading(true);
    try {
      const { url } = await PublicEventsService.uploadArtistImage(file);
      setArtist((current) => ({ ...current, imageUrl: url }));
    } catch {
      setUploadError(t("media.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const showFields = mode === "manual" || Boolean(artist.name);

  return (
    <fieldset disabled={uploading} className="min-w-0 space-y-6">
      <div
        role="group"
        aria-label={t("lineup.entryMethod")}
        className="inline-flex max-w-full gap-1 rounded-full bg-white/[0.04] p-1"
      >
        {(["spotify", "manual"] as const).map((item) => {
          const Icon = item === "spotify" ? Search : PenLine;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => {
                if (mode !== item) {
                  setMode(item);
                  reset();
                }
              }}
              className={
                "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:text-sm " +
                (mode === item
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(
                item === "spotify"
                  ? "lineup.searchSpotify"
                  : "lineup.manualEntry",
              )}
            </button>
          );
        })}
      </div>

      {mode === "spotify" && !artist.name && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("lineup.searchArtist")}
            placeholder={t("lineup.searchArtist")}
            className={eventInputClass + " pl-11"}
          />
          {(results.length > 0 || searching) && (
            <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-white/10 bg-zinc-950 p-1.5 shadow-2xl">
              {searching && (
                <p
                  role="status"
                  className="px-3 py-3 text-sm text-muted-foreground"
                >
                  {t("lineup.searching")}
                </p>
              )}
              {!searching &&
                results.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => selectSpotifyArtist(result)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-white/5"
                  >
                    {result.imageUrl ? (
                      <img
                        src={result.imageUrl}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        <Music2 className="h-4 w-4" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {result.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {(result.genres ?? []).slice(0, 2).join(" · ") ||
                          t("lineup.spotifyArtist")}
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {showFields && (
        <>
          <div className="flex items-end gap-4 sm:gap-5">
            <div className="shrink-0">
              <input
                ref={imageInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void uploadImage(file);
                }}
              />
              <button
                type="button"
                onClick={() => imageInput.current?.click()}
                aria-label={t(
                  artist.imageUrl ? "media.replaceImage" : "lineup.uploadImage",
                )}
                className="group relative grid h-20 w-20 place-items-center rounded-2xl border border-dashed border-white/20 bg-white/[0.025] text-muted-foreground transition hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:h-24 sm:w-24"
              >
                {artist.imageUrl && !imageFailed ? (
                  <img
                    src={artist.imageUrl}
                    alt=""
                    onError={() => setImageFailed(true)}
                    className="absolute inset-0 h-full w-full rounded-2xl object-cover"
                  />
                ) : (
                  <span className="flex flex-col items-center gap-1.5">
                    <Camera className="h-5 w-5" />
                    <span className="text-xs">{t("lineup.photo")}</span>
                  </span>
                )}
                {artist.imageUrl && !imageFailed && (
                  <span className="absolute bottom-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/75 text-white">
                    <Camera className="h-3.5 w-3.5" />
                  </span>
                )}
                {uploading && (
                  <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/65">
                    <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
                  </span>
                )}
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <Field
                label={t("lineup.artistName")}
                value={artist.name}
                onChange={(name) =>
                  setArtist((current) => ({ ...current, name }))
                }
                placeholder={t("lineup.artistNamePlaceholder")}
                required
                maxLength={120}
              />
            </div>
          </div>
          {uploadError && (
            <p role="alert" className="text-xs text-red-400">
              {uploadError}
            </p>
          )}
          {uploading && (
            <p role="status" className="text-xs text-muted-foreground">
              {t("lineup.uploading")}
            </p>
          )}

          <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2">
            <Field
              label={t("lineup.stage")}
              value={artist.stage}
              onChange={(stage) =>
                setArtist((current) => ({ ...current, stage }))
              }
              placeholder={t("lineup.stagePlaceholder")}
              maxLength={120}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground/85">
                {t("lineup.time")}
              </p>
              <TimePicker
                value={artist.performanceTime}
                onChange={(performanceTime) =>
                  setArtist((current) => ({ ...current, performanceTime }))
                }
                className="h-[46px] gap-2 rounded-xl bg-white/[0.025] px-4 text-sm"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
            <span className="flex min-w-0 items-center gap-3">
              <Star
                className={
                  "h-5 w-5 shrink-0 " +
                  (artist.isHeadliner
                    ? "fill-primary/15 text-primary"
                    : "text-muted-foreground")
                }
              />
              <span>
                <span className="block text-sm font-medium">
                  {t("lineup.headliner")}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {t("lineup.headlinerHint")}
                </span>
              </span>
            </span>
            <span className="relative shrink-0">
              <input
                type="checkbox"
                role="switch"
                aria-label={t("lineup.headliner")}
                checked={artist.isHeadliner}
                onChange={(event) =>
                  setArtist((current) => ({
                    ...current,
                    isHeadliner: event.target.checked,
                  }))
                }
                className="peer sr-only"
              />
              <span className="block h-6 w-11 rounded-full bg-white/15 transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background" />
              <span className="pointer-events-none absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
            </span>
          </label>

          <details className="group border-t border-white/10 pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm text-muted-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
              <Link2 className="h-4 w-4" />
              {t("lineup.optionalLinks")}
              <ChevronDown className="ml-auto h-4 w-4 transition group-open:rotate-180" />
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field
                label={t("lineup.imageUrl")}
                value={artist.imageUrl}
                onChange={(imageUrl) => {
                  setUploadError("");
                  setArtist((current) => ({ ...current, imageUrl }));
                }}
                placeholder="https://..."
              />
              {mode === "manual" && (
                <Field
                  label={t("lineup.spotifyProfile")}
                  value={artist.spotifyUrl}
                  onChange={(spotifyUrl) =>
                    setArtist((current) => ({ ...current, spotifyUrl }))
                  }
                  placeholder="https://open.spotify.com/..."
                />
              )}
            </div>
          </details>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-medium text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
            >
              {t("lineup.cancel")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!artist.name.trim() || uploading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary/10 px-5 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-4 w-4" />
              {t("lineup.addToLineup")}
            </button>
          </div>
        </>
      )}
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium text-foreground/85">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-primary">
            *
          </span>
        )}
      </span>
      <input
        value={value}
        aria-required={required}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={eventInputClass}
      />
    </label>
  );
}
