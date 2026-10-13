export const getScannerConnection = async (): Promise<boolean | null> => typeof navigator === 'undefined' ? null : navigator.onLine;
export function watchScannerConnection(listener: (value: boolean | null) => void) {
  if (typeof window === 'undefined') return () => {};
  const report = () => listener(navigator.onLine);
  window.addEventListener('online', report); window.addEventListener('offline', report); report();
  return () => { window.removeEventListener('online', report); window.removeEventListener('offline', report); };
}
