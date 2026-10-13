import type { Admission } from './admission';
export type ScannerCue = 'success' | 'duplicate' | 'error';
export function scannerCue(result?: Admission, error?: string): ScannerCue | undefined {
  if (error) return 'error';
  if (!result) return undefined;
  if (result.status === 'valid' || result.status === 'accepted') return 'success';
  if (result.status === 'duplicate' || result.status === 'already_validated') return 'duplicate';
  return 'error';
}
