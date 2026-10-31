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

// Keep the identity independent of refreshes to the provider and its copy/data
// dependencies. Mounted providers and newly refreshed consumers must agree.
export const PreferencesContext = createContext<PreferencesState | null>(null);
