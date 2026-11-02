import { useContext } from 'react';
import { PreferencesContext, CopyPreferencesContext, type PreferencesState, type CopyPreferences } from './preferencesContext';

export function usePreferences(): PreferencesState;
export function usePreferences(scope: 'copy'): CopyPreferences;
export function usePreferences(scope?: 'copy') {
  const context = (scope === 'copy' ? CopyPreferencesContext : PreferencesContext) as React.Context<PreferencesState | CopyPreferences | null>;
  const state = useContext(context);
  if (!state) throw new Error('Missing PreferencesProvider');
  return state;
}
