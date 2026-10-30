import { useContext } from 'react';
import { PreferencesContext } from './preferencesContext';

export function usePreferences() {
  const state = useContext(PreferencesContext);
  if (!state) throw new Error('Missing PreferencesProvider');
  return state;
}
