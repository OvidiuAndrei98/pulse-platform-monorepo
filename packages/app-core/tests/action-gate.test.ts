import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedActionGate } from '@packages/app-core/async/actionGate';

test('actions acquire synchronously, reject duplicate taps and can retry after release', () => {
  const actor={},gate=createScopedActionGate(()=>actor),first=gate.acquire(actor)!;
  assert.ok(first.current());assert.equal(gate.acquire(actor),undefined);
  first.release();assert.equal(first.current(),false);assert.ok(gate.acquire(actor));
});
test('an obsolete session cannot update or unlock a newer action', () => {
  const firstActor={},secondActor={};let actor:object|undefined=firstActor;
  const gate=createScopedActionGate(()=>actor),old=gate.acquire(firstActor)!;
  actor=secondActor;assert.equal(old.current(),false);assert.equal(gate.acquire(firstActor),undefined);
  const current=gate.acquire(secondActor)!;old.release();assert.ok(current.current());
  actor=undefined;assert.equal(current.current(),false);
});
