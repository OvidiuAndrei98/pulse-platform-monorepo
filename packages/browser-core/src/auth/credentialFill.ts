import { completeCredentials, type LoginCredentials } from '@packages/app-core/auth/credentialFill';
export { completeCredentials, createCredentialFillSubmitter, isCredentialReplacement, type LoginCredentials } from '@packages/app-core/auth/credentialFill';

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
