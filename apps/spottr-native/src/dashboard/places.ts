import { ApiError, type createHttp } from "../data/http";

export type PlacePrediction = { placeId: string; name: string; description: string };
export type Venue = { placeId: string; name: string; lat: number; lng: number };
export type PlaceSearchState = {
  query: string;
  predictions: PlacePrediction[];
  loading: boolean;
  selecting: boolean;
  error: boolean;
  searched: boolean;
};
const validId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,255}$/.test(value);
const row = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export function parsePredictions(value: unknown): PlacePrediction[] {
  if (!Array.isArray(value)) throw new ApiError(0, "INVALID_RESPONSE");
  return value.slice(0, 5).map(value => {
    const p = row(value);
    if (!validId(p.placeId) || typeof p.name !== "string" || !p.name.trim() || typeof p.description !== "string") throw new ApiError(0, "INVALID_RESPONSE");
    return { placeId: p.placeId, name: p.name, description: p.description };
  });
}
export function parseVenue(value: unknown, placeId: string): Venue {
  const p = row(value);
  if (!validId(p.placeId) || p.placeId !== placeId || typeof p.name !== "string" || !p.name.trim() ||
    typeof p.lat !== "number" || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 ||
    typeof p.lng !== "number" || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180) throw new ApiError(0, "INVALID_RESPONSE");
  return { placeId: p.placeId, name: p.name, lat: p.lat, lng: p.lng };
}
export function createPlacesApi(request: ReturnType<typeof createHttp>) {
  function params(session: string, language: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(session)) throw new Error("Invalid Places session");
    return new URLSearchParams({ session, language: language === "ro" ? "ro" : "en" });
  }
  return {
    async search(query: string, session: string, language: string, signal: AbortSignal) {
      const trimmed = query.trim();
      if (Array.from(trimmed).length < 2) return [];
      if (Array.from(trimmed).length > 120 || /[\r\n\u0000]/.test(trimmed)) throw new Error("Invalid Places query");
      const p = params(session, language); p.set("q", trimmed);
      return parsePredictions(await request(`/dashboard/places/autocomplete?${p}`, { signal }));
    },
    async details(placeId: string, session: string, language: string, signal: AbortSignal) {
      if (!validId(placeId)) throw new Error("Invalid place ID");
      const p = params(session, language); p.set("placeId", placeId);
      return parseVenue(await request(`/dashboard/places/details?${p}`, { signal }), placeId);
    },
  };
}

/** One debounced autocomplete session; outdated suggestions/details never update a newer edit. */
export function createPlaceSearch({ api, nonce, language, onState, onSelect, delay = 300 }: {
  api: ReturnType<typeof createPlacesApi>;
  nonce: () => string;
  language: string;
  onState: (state: PlaceSearchState) => void;
  onSelect: (venue: Venue) => void;
  delay?: number;
}) {
  let state: PlaceSearchState = { query: "", predictions: [], loading: false, selecting: false, error: false, searched: false };
  let generation = 0, session = "", controller: AbortController | undefined, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = (patch: Partial<PlaceSearchState>) => { if (!disposed) { state = { ...state, ...patch }; onState(state); } };
  const cancel = () => { generation++; clearTimeout(timer); controller?.abort(); controller = undefined; };
  async function search(query: string, version: number) {
    controller = new AbortController(); const pending = controller;
    if (!session) session = nonce();
    try {
      const predictions = await api.search(query, session, language, pending.signal);
      if (!disposed && generation === version) update({ predictions, loading: false, searched: true });
    } catch {
      if (!disposed && generation === version && !pending.signal.aborted) update({ loading: false, error: true, searched: true });
    }
  }
  function change(value: string) {
    if (disposed) return;
    cancel();
    const query = Array.from(value).slice(0, 120).join("");
    const enabled = Array.from(query.trim()).length >= 2;
    if (!enabled) session = "";
    update({ query, predictions: [], loading: enabled, selecting: false, error: false, searched: false });
    if (enabled) { const version = generation; timer = setTimeout(() => void search(query, version), delay); }
  }
  async function select(prediction: PlacePrediction) {
    if (disposed || state.selecting || !state.predictions.some(p => p.placeId === prediction.placeId)) return;
    cancel(); const version = generation;
    controller = new AbortController(); const pending = controller;
    const selectionSession = session || nonce();
    // Details completes the Google billing session even if the next edit starts before it returns.
    session = "";
    update({ selecting: true, loading: false, error: false });
    try {
      const venue = await api.details(prediction.placeId, selectionSession, language, pending.signal);
      if (disposed || version !== generation || pending.signal.aborted) return;
      update({ query: venue.name, predictions: [], selecting: false, searched: false });
      onSelect(venue);
    } catch {
      if (!disposed && generation === version && !pending.signal.aborted) update({ selecting: false, error: true });
    }
  }
  return { change, select, retry: () => change(state.query), dispose: () => { disposed = true; cancel(); }, getState: () => state };
}
