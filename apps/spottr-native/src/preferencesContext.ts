import { createContext } from 'react';
import type { Preferences } from './data/preferences';
import type { Event } from './data/events';
import type { CopyKey, Language } from './i18n';

export type PreferencesState = Preferences & {
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

// Loading favorites must not broadcast through every screen that only needs
// translated copy. Keep this context stable until language actually changes.
export type CopyPreferences = Pick<PreferencesState, 'language' | 't' | 'copy' | 'setLanguage'>;

function createPreferencesContexts() {
  return {
    preferences: createContext<PreferencesState | null>(null),
    copy: createContext<CopyPreferences | null>(null),
  };
}

// Fast Refresh can re-evaluate this module before replacing a mounted provider.
// Reuse context identities in development so refreshed consumers still see it.
// This stores no preference/account snapshot; React still owns provider values.
// Production and a full Reload always start with fresh contexts.
const runtime = globalThis as typeof globalThis & {
  __spottrPreferencesContextsV1?: ReturnType<typeof createPreferencesContexts>;
};
const contexts = typeof __DEV__ !== 'undefined' && __DEV__
  ? (runtime.__spottrPreferencesContextsV1 ??= createPreferencesContexts())
  : createPreferencesContexts();
export const PreferencesContext = contexts.preferences;
export const CopyPreferencesContext = contexts.copy;
