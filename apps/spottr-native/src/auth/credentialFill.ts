import type { LoginCredentials } from '@packages/app-core/auth/credentialFill';

/** Native inputs report fill changes themselves; the DOM watcher is web-only. */
export function watchBrowserCredentialFill(_email: unknown, _password: unknown, _filled: (value: LoginCredentials) => void) {
  return () => {};
}
