import assert from 'node:assert/strict';
import test from 'node:test';
import { createCredentialFillSubmitter, isCredentialReplacement } from '@packages/app-core/auth/credentialFill';

function fixture() {
  let enabled = true, next = 0;
  const jobs = new Map<number, () => void>(), attempts: unknown[] = [];
  const fill = createCredentialFillSubmitter({ enabled: () => enabled,
    submit: () => attempts.push(fill.read()),
    schedule: callback => { const id = ++next; jobs.set(id, callback); return id as unknown as ReturnType<typeof setTimeout>; },
    clear: timer => { jobs.delete(timer as unknown as number); },
  });
  return { fill, attempts, enable: (value: boolean) => { enabled = value; },
    flush: () => { const callbacks = [...jobs.values()]; jobs.clear(); callbacks.forEach(callback => callback()); } };
}

for (const passwordFirst of [false, true]) test(`credential batch submits once, passwordFirst=${passwordFirst}`, () => {
  const {fill, flush, attempts} = fixture();
  const fields = passwordFirst ? ['password', 'email'] as const : ['email', 'password'] as const;
  const values = { email: ' person@example.test ', password: 'fixture-only-password' };
  fill.update(fields[0], values[fields[0]]); flush(); assert.equal(attempts.length, 0);
  fill.update(fields[1], values[fields[1]]); flush();
  assert.deepEqual(attempts, [{email:'person@example.test',password:values.password}]);
  fill.update('email', values.email, true); fill.update('password', values.password, true); flush();
  assert.equal(attempts.length, 1, 'Repeated autofill events must not retry a rejected login');
});

test('ordinary typing, deleting and one-character edits never submit automatically', () => {
  const {fill, flush, attempts} = fixture();
  fill.update('email', 'person@example.test');
  let password = '';
  for (const char of 'password') { password += char; fill.update('password', password); flush(); }
  fill.update('password', 'passw0rd'); flush();
  fill.update('password', 'passw0r'); flush();
  assert.equal(attempts.length, 0);
  assert.equal(isCredentialReplacement('passw0rd', 'passw0rd123'), true);
});

test('incomplete/invalid credentials and signup forms do not trigger login', () => {
  const f = fixture(); f.fill.update('password', 'fixture-only'); f.flush();
  f.fill.update('email', 'invalid'); f.flush(); assert.equal(f.attempts.length, 0);
  f.enable(false); f.fill.update('email', 'person@example.test'); f.fill.update('password', 'signup-password'); f.flush();
  assert.equal(f.attempts.length, 0);
});

test('manual Enter cancels scheduled autofill; duplicate notifications cannot retry', () => {
  const {fill, flush, attempts} = fixture();
  fill.update('email', 'person@example.test'); fill.update('password', 'fixture-only');
  fill.markAttempt(); flush();
  fill.update('password', 'fixture-only', true); flush(); assert.equal(attempts.length, 0);
  fill.update('password', 'different-fixture'); flush(); assert.equal(attempts.length, 1);
});

test('manual edit, navigation away, and disposal cancel the pending attempt', () => {
  for (const stop of ['edit', 'disabled', 'dispose'] as const) {
    const f = fixture(); f.fill.update('email', 'person@example.test'); f.fill.update('password', 'fixture-only');
    if (stop === 'edit') f.fill.update('password', 'fixture-only!');
    if (stop === 'disabled') f.enable(false);
    if (stop === 'dispose') f.fill.reset();
    f.flush(); assert.equal(f.attempts.length, 0, stop);
    if (stop === 'dispose') assert.deepEqual(f.fill.read(), {email:'',password:''});
  }
});
