import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';

type ToastInput = { key: string; kind?: 'success' | 'error' | 'info'; action?: { key: string; run: () => void } };
type Toast = ToastInput & { id: number };
type ToastState = { toast: Toast | null; show: (value: ToastInput) => void; dismiss: (id: number) => void; clear: () => void };
const Context = createContext<ToastState | null>(null);

export function ToastProvider({ children }: React.PropsWithChildren) {
  const { user } = useAuth();
  const [toast, setToast] = useState<Toast | null>(null), sequence = useRef(0);
  const show = useCallback((value: ToastInput) => setToast({ ...value, id: ++sequence.current }), []);
  const dismiss = useCallback((id: number) => setToast(current => current?.id === id ? null : current), []);
  const clear = useCallback(() => setToast(null), []);
  useEffect(() => { setToast(null); }, [user?.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.kind === 'error' ? 6000 : toast.action ? 2400 : 1800);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);
  const value = useMemo(() => ({ toast, show, dismiss, clear }), [toast, show, dismiss, clear]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useToast() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing ToastProvider');
  return value;
}
