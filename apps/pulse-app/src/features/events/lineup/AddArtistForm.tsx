"use client";

import { Check, ImageUp, Music2, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PublicEventsService, type SpotifyArtist } from "@/core/DataProvider";
import { TimePicker } from "@/features/events/form/DateTimePicker";

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
  name: "", imageUrl: "", stage: "", performanceTime: "", spotifyUrl: "", isHeadliner: false, source: "MANUAL",
});

export function AddArtistForm({ onAdd }: { onAdd: (artist: LineupArtistInput) => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"spotify" | "manual">("spotify");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpotifyArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [artist, setArtist] = useState<LineupArtistInput>(emptyArtist);

  useEffect(() => {
    const value = query.trim();
    if (mode !== "spotify" || value.length < 2) {
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
  }, [mode, query]);

  const selectSpotifyArtist = (result: SpotifyArtist) => {
    setArtist({ name: result.name, imageUrl: result.imageUrl || "", spotifyUrl: result.spotifyUrl || "", stage: "", performanceTime: "", isHeadliner: false, source: "SPOTIFY" });
    setQuery(result.name);
    setResults([]);
  };
  const submit = () => {
    if (!artist.name.trim()) return;
    onAdd({ ...artist, name: artist.name.trim() });
    setArtist(emptyArtist());
    setQuery("");
    setResults([]);
  };
  const uploadImage = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await PublicEventsService.uploadArtistImage(file);
      setArtist((current) => ({ ...current, imageUrl: url }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="border border-white/[0.08] bg-black/15 p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{t("lineup.addArtist")}</p>
        <button type="button" onClick={() => { const nextMode = mode === "spotify" ? "manual" : "spotify"; setMode(nextMode); setResults([]); setQuery(""); setArtist(emptyArtist()); }} className="text-xs font-semibold text-primary transition hover:text-primary/80">
          {mode === "spotify" ? t("lineup.manualEntry") : t("lineup.searchSpotify")}
        </button>
      </div>

      {mode === "spotify" && !artist.name && (
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("lineup.searchArtist")} className="h-11 w-full rounded-md border border-white/10 bg-background px-9 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/60" />
          {(results.length > 0 || searching) && (
            <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-md border border-white/10 bg-zinc-950 p-1 shadow-2xl">
              {searching && <p className="px-3 py-2 text-xs text-muted-foreground">{t("lineup.searching")}</p>}
              {!searching && results.map((result) => (
                <button key={result.id} type="button" onClick={() => selectSpotifyArtist(result)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-white/5">
                  {result.imageUrl ? <img src={result.imageUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary"><Music2 className="h-4 w-4" /></div>}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{result.name}</span><span className="block truncate text-xs text-muted-foreground">{(result.genres ?? []).slice(0, 2).join(" · ") || t("lineup.spotifyArtist")}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(mode === "manual" || artist.name) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t("lineup.artistName")} value={artist.name} onChange={(name) => setArtist((current) => ({ ...current, name }))} required />
          <div className="grid gap-1 text-xs font-medium text-muted-foreground"><Field label={t("lineup.imageUrl")} value={artist.imageUrl} onChange={(imageUrl) => setArtist((current) => ({ ...current, imageUrl }))} placeholder="https://..." /><label className="inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary transition hover:text-primary/80"><ImageUp className="h-3.5 w-3.5" />{uploading ? t("lineup.uploading") : t("lineup.uploadImage")}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(event) => uploadImage(event.target.files?.[0])} /></label></div>
          <Field label={t("lineup.stage")} value={artist.stage} onChange={(stage) => setArtist((current) => ({ ...current, stage }))} placeholder={t("lineup.stagePlaceholder")} />
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">{t("lineup.time")}<TimePicker value={artist.performanceTime} onChange={(performanceTime) => setArtist((current) => ({ ...current, performanceTime }))} /></label>
          {mode === "manual" && <Field label={t("lineup.spotifyProfile")} value={artist.spotifyUrl} onChange={(spotifyUrl) => setArtist((current) => ({ ...current, spotifyUrl }))} placeholder="https://open.spotify.com/..." />}
          <label className="flex h-11 items-center gap-2 rounded-md border border-white/10 bg-background px-3 text-sm font-medium"><input type="checkbox" checked={artist.isHeadliner} onChange={(event) => setArtist((current) => ({ ...current, isHeadliner: event.target.checked }))} className="h-4 w-4 accent-primary" />{t("lineup.headliner")}</label>
        </div>
      )}

      {artist.name && <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => { setArtist(emptyArtist()); setQuery(""); }} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-muted-foreground transition hover:bg-white/5"><X className="h-3.5 w-3.5" /> {t("lineup.cancel")}</button><button type="button" onClick={submit} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-110"><Check className="h-3.5 w-3.5" /> {t("lineup.addToLineup")}</button></div>}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return <label className="grid gap-1 text-xs font-medium text-muted-foreground">{label}{required && <span className="text-primary"> *</span>}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 rounded-md border border-white/10 bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60" /></label>;
}
