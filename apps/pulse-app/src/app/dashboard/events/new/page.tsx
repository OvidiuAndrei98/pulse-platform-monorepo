"use client";

import { useState, useCallback } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { ApiClient } from "@packages/api-client/src/Client";
import {
  PlacesAutocomplete,
  PlaceResult,
} from "@/components/PlacesAutocomplete";

const CATEGORIES = [
  "Muzică & Concerte",
  "Festival",
  "Club & Party",
  "Stand-up Comedy",
  "Sport",
  "Teatru & Arte",
  "Tech & Business",
  "Gastronomie",
  "Altele",
];

export default function NewEventPage() {
  const router = useRouter();
  const [mapsReady, setMapsReady] = useState(false);
  const [place, setPlace] = useState<PlaceResult | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "",
    bannerUrl: "",
    startTime: "",
    endTime: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set =
    (field: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handlePlaceSelect = useCallback((p: PlaceResult) => {
    setPlace(p);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!place) {
      setError("Selectează o locație validă din sugestiile Google Places.");
      return;
    }
    if (!form.startTime || !form.endTime) {
      setError("Data și ora de start și final sunt obligatorii.");
      return;
    }

    setLoading(true);
    try {
      await ApiClient.instance.post("/events", {
        body: {
          title: form.title,
          description: form.description,
          category: form.category,
          bannerUrl: form.bannerUrl || undefined,
          googlePlaceId: place.placeId,
          locationName: place.name,
          latitude: place.lat,
          longitude: place.lng,
          startTime: new Date(form.startTime).toISOString(),
          endTime: new Date(form.endTime).toISOString(),
        },
      });
      router.push("/organizer/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Eroare la crearea evenimentului",
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 w-full";

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
        onLoad={() => setMapsReady(true)}
      />

      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={() => router.back()}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mb-6 flex items-center gap-1 transition-colors"
          >
            ← Înapoi
          </button>

          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-8">
            Eveniment nou
          </h1>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Titlu */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Titlu eveniment *
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={set("title")}
                className={inputClass}
                placeholder="Ex: Summer Vibes Festival 2026"
              />
            </div>

            {/* Categorie */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Categorie *
              </label>
              <select
                required
                value={form.category}
                onChange={set("category")}
                className={inputClass}
              >
                <option value="" disabled>
                  Selectează categoria...
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Locație — Google Places */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Locație *{" "}
                <span className="text-xs font-normal text-zinc-400">
                  (selectează din sugestii)
                </span>
              </label>
              <PlacesAutocomplete
                ready={mapsReady}
                onSelect={handlePlaceSelect}
                placeholder="Caută club, sală, restaurant..."
                className={inputClass}
              />
              {place && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <span>✓</span>
                  <span>
                    {place.name} ({place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                    )
                  </span>
                </p>
              )}
              {!mapsReady && (
                <p className="text-xs text-zinc-400">Se încarcă Google Maps…</p>
              )}
            </div>

            {/* Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Start *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={form.startTime}
                  onChange={set("startTime")}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Final *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={form.endTime}
                  min={form.startTime}
                  onChange={set("endTime")}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Descriere */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Descriere
              </label>
              <textarea
                rows={4}
                value={form.description}
                onChange={set("description")}
                className={inputClass + " resize-none"}
                placeholder="Detalii despre eveniment, lineup, dresscode..."
              />
            </div>

            {/* Banner URL */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                URL Banner (opțional)
              </label>
              <input
                type="url"
                value={form.bannerUrl}
                onChange={set("bannerUrl")}
                className={inputClass}
                placeholder="https://..."
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Anulează
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-zinc-900 dark:bg-zinc-50 px-4 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Se publică…" : "Publică eveniment"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
