export type LoginCredentials = { email: string; password: string };

export function completeCredentials(value: LoginCredentials) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()) && value.password.length > 0;
}

/** Native text inputs do not identify the password manager. Detect a complete
 * replacement (also accepts pasting credentials), never ordinary typing. */
export function isCredentialReplacement(before: string, after: string) {
  let start = 0, end = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return after.length - start - end > 1;
}

/** Values live only with the form, and are never persisted or logged. */
export function createCredentialFillSubmitter(options: {
  enabled: () => boolean; submit: () => void;
  schedule?: (callback: () => void) => ReturnType<typeof setTimeout>;
  clear?: (timer: ReturnType<typeof setTimeout>) => void;
}) {
  let values: LoginCredentials = { email: '', password: '' };
  let candidate: string | null = null, attempted: LoginCredentials | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) (options.clear ?? clearTimeout)(timer); timer = undefined; candidate = null; };
  return {
    read: () => ({ email: values.email.trim(), password: values.password }),
    cancel,
    markAttempt() { cancel(); attempted = { ...values }; },
    reset(next: LoginCredentials = { email: '', password: '' }) { cancel(); values = next; attempted = null; },
    update(field: keyof LoginCredentials, next: string, autofilled = false) {
      const before = values[field];
      values = { ...values, [field]: next };
      if (!options.enabled()) { cancel(); return; }
      if (next === before && !autofilled) return;
      const replacement = autofilled || isCredentialReplacement(before, next);
      if (!replacement) { cancel(); return; }
      if (field === 'password') candidate = next;
      if (timer !== undefined) (options.clear ?? clearTimeout)(timer);
      timer = undefined;
      if (!candidate || candidate !== values.password || !completeCredentials(values)) return;
      timer = (options.schedule ?? (callback => setTimeout(callback, 240)))(() => {
        timer = undefined;
        if (!candidate || candidate !== values.password || !options.enabled() || !completeCredentials(values)) return;
        candidate = null;
        if (attempted?.email === values.email && attempted.password === values.password) return;
        attempted = { ...values };
        options.submit();
      });
    },
  };
}

/** Safari/Chromium sometimes fill DOM values before React receives a change.
 * Observe their autofill signal, including when returning from a password picker. */
export function watchBrowserCredentialFill(email: HTMLInputElement, password: HTMLInputElement, filled: (value: LoginCredentials) => void) {
  const style = document.createElement('style');
  style.textContent = '@keyframes spottr-credential-fill { from { opacity: 1 } to { opacity: 1 } } .spottr-credential-fill:-webkit-autofill { animation-name: spottr-credential-fill; animation-duration: 1ms; }';
  document.head.appendChild(style);
  email.classList.add('spottr-credential-fill'); password.classList.add('spottr-credential-fill');
  const autofilled = () => [':autofill', ':-webkit-autofill'].some(selector => { try { return password.matches(selector); } catch { return false; } });
  const read = (event?: Event) => {
    if (event && 'animationName' in event && event.animationName !== 'spottr-credential-fill') return;
    if (!autofilled()) return;
    if (completeCredentials({ email: email.value, password: password.value })) filled({ email: email.value, password: password.value });
  };
  const events = ['input', 'change', 'animationstart', 'focus'];
  for (const input of [email, password]) for (const event of events) input.addEventListener(event, read);
  window.addEventListener('focus', read);
  const initial = setTimeout(read, 0);
  return () => {
    clearTimeout(initial); style.remove();
    for (const input of [email, password]) { input.classList.remove('spottr-credential-fill'); for (const event of events) input.removeEventListener(event, read); }
    window.removeEventListener('focus', read);
  };
}
