import { haptic } from "./ui/haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  parsePreferences,
  serializedWriter,
  type Preferences,
} from "./data/preferences";
import { Event, normalizeEvent } from "./data/events";
import { useQuery } from "@tanstack/react-query";
import { useAuth, accountApi } from "./auth/AuthProvider";
import { queryClient } from "./data/queries";
import { translate, type CopyKey, type Language } from "./i18n";
import { productCopy } from "./copy";
import { useToast } from './ui/ToastProvider';

const KEY = "spottr-native:preferences:v1";
const writePreferences = serializedWriter((value) =>
  AsyncStorage.setItem(KEY, value),
);
type State = Preferences & {
  ready: boolean;
  storageError: boolean;
  actionError: boolean;
  savedLoading: boolean;
  savedError: boolean;
  retrySaved: () => void;
  t: (key: CopyKey) => string;
  copy: (key: string, values?: Record<string, string | number>) => string;
  setLanguage: (language: Language) => void;
  toggleSaved: (event: Event) => void;
};
const Context = createContext<State | null>(null);

export function PreferencesProvider({ children }: React.PropsWithChildren) {
  const { user, controller } = useAuth();
  const { show, clear } = useToast();
  const [actionError, setActionError] = useState(false);
  const favoritesKey = ["saved-events", user?.id] as const;
  const favorites = useQuery({
    queryKey: favoritesKey,
    enabled: !!user,
    queryFn: async ({ signal }) => {
      const rows = await accountApi<unknown[] | null>(
        "/users/me/saved-events",
        { signal },
      );
      if (rows !== null && !Array.isArray(rows))
        throw new Error("Invalid saved events");
      return (rows ?? [])
        .map(normalizeEvent)
        .filter((event): event is Event => event !== null);
    },
  });
  const saves = useRef(
    new Map<
      string,
      { desired: boolean; confirmed: boolean; running: boolean; revision: number }
    >(),
  );
  const saveRevision = useRef(0);
  useEffect(() => {
    saves.current.clear();
    setActionError(false);
  }, [user?.id]);
  const [state, setState] = useState<Preferences>(() => ({
    language: "en",
    saved: [],
  }));
  const stateRef = useRef(state);
  const [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive) return;
        const value = { ...parsePreferences(raw, stateRef.current.language), saved: [] };
        stateRef.current = value;
        setState(value);
      })
      .catch(() => {
        if (alive) setStorageError(true);
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  const update = (next: Preferences) => {
    if (!ready) return;
    stateRef.current = next;
    setState(next);
    const version = ++revision.current;
    void writePreferences(JSON.stringify({ language: next.language, saved: [] }))
      .then(() => {
        if (version === revision.current) setStorageError(false);
      })
      .catch(() => {
        if (version === revision.current) setStorageError(true);
      });
  };
  useEffect(() => {
    if (
      ready &&
      user?.preferredLanguage &&
      user.preferredLanguage !== stateRef.current.language
    )
      update({ ...stateRef.current, language: user.preferredLanguage });
  }, [ready, user?.preferredLanguage]);
  const saved = user ? (favorites.data ?? []) : [];
  const changeSaved = (event: Event) => {
    const token = controller.getToken();
    if (!user || !token) { show({ key: 'toast.signInToSave', kind: 'info' }); return; }
    if (!favorites.data) { show({ key: 'toast.saveFailed', kind: 'error' }); return; }
    const currentlySaved = (queryClient.getQueryData<Event[]>(favoritesKey) ?? []).some(e => e.id === event.id);
    const entry = saves.current.get(event.id) ?? { desired: currentlySaved, confirmed: currentlySaved, running: false, revision: 0 };
    saves.current.set(event.id, entry);
    entry.desired = !entry.desired;
    entry.revision = ++saveRevision.current;
    const reflect = (value: boolean) => queryClient.setQueryData<Event[]>(favoritesKey, old =>
      value ? [event, ...(old ?? []).filter(e => e.id !== event.id)] : (old ?? []).filter(e => e.id !== event.id));
    reflect(entry.desired);
    haptic('selection');
    setActionError(false);
    clear();
    if (entry.running) return;
    entry.running = true;
    void (async () => {
      try {
        while (entry.desired !== entry.confirmed && controller.getToken() === token) {
          const target = entry.desired;
          await accountApi('/events/' + event.id + '/favorite', { method: target ? 'POST' : 'DELETE', token });
          if (controller.getToken() !== token) return;
          entry.confirmed = target;
        }
      } catch {
        if (controller.getToken() === token) {
          entry.desired = entry.confirmed;
          reflect(entry.confirmed);
          setActionError(true);
          if (entry.revision === saveRevision.current) show({ key: 'toast.saveFailed', kind: 'error' });
        }
      } finally { entry.running = false; }
    })();
  };
  return (
    <Context.Provider
      value={{
        ...state,
        saved,
        ready,
        storageError,
        actionError,
        savedLoading: !!user && favorites.isPending,
        savedError: !!user && favorites.isError,
        retrySaved: () => { void favorites.refetch(); },
        t: (key) => translate(state.language, key),
        copy: (key, values) => productCopy(state.language, key, values),
        setLanguage: (language) => update({ ...stateRef.current, language }),
        toggleSaved: (event) => changeSaved(event),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const state = useContext(Context);
  if (!state) throw new Error("Missing PreferencesProvider");
  return state;
}
