"use client";

import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** A streamed private page can hydrate after session loading already changed
 * i18next to Romanian. Its first hydration must still match the English HTML
 * emitted by the server; React then updates it to the account's language. */
export function useHydratedTranslation() {
  const translation = useTranslation();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return { ...translation, t: hydrated ? translation.t : translation.i18n.getFixedT('en') };
}
