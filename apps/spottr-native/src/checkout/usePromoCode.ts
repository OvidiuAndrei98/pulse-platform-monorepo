import { useEffect, useRef, useState } from 'react';
import { accountApi } from '../auth/AuthProvider';
import { ApiError } from '../data/http';
import { parsePromo, type Promo } from './data';

export function usePromoCode(eventId: string) {
  const [code, setCodeState] = useState(''), [applied, setApplied] = useState<Promo | null>(null);
  const [error, setError] = useState<string | null>(null), [validating, setValidating] = useState(false);
  const revision = useRef(0), pending = useRef(false);
  useEffect(() => { revision.current++; pending.current = false; setCodeState(''); setApplied(null); setError(null); setValidating(false); return () => { revision.current++; }; }, [eventId]);
  const setCode = (value: string) => { revision.current++; pending.current = false; setValidating(false); setCodeState(value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40)); setApplied(null); setError(null); };
  const apply = async () => {
    if (pending.current || code.length < 3) return;
    const generation = ++revision.current;
    pending.current = true; setValidating(true); setError(null);
    try {
      const result = parsePromo(await accountApi('/events/' + eventId + '/promo-code/validate', { method: 'POST', body: { code } }));
      if (generation !== revision.current) return;
      setApplied(result); setCodeState(result.code);
    } catch (error) {
      if (generation === revision.current) setError(error instanceof ApiError && error.status >= 400 && error.status < 500 ? 'checkout.promoInvalid' : 'checkout.promoValidationFailed');
    } finally { if (generation === revision.current) { pending.current = false; setValidating(false); } }
  };
  return { code, setCode, applied, error, validating, apply, clear: () => setCode('') };
}
