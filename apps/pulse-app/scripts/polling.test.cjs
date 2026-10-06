const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture() {
  const timers = new Map(); let id = 0;
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const navigator = { onLine: true };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/visiblePolling.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, window, document, navigator, Math,
    setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  return { start: exports.startVisiblePolling, timers, window, document, navigator,
    tick: () => { const [id, timer] = timers.entries().next().value; timers.delete(id); return timer.fn(); },
  };
}

test('slow refreshes never overlap; hidden/offline pages pause and disposal stays stopped', async () => {
  const f = fixture(); let calls = 0; let finish;
  const stop = f.start(() => { calls++; return new Promise(resolve => { finish = resolve; }); }, 8000);
  const pending = f.tick();
  f.window.dispatchEvent(new Event('focus'));
  f.window.dispatchEvent(new Event('online'));
  assert.equal(calls, 1);
  f.document.visibilityState = 'hidden';
  f.document.dispatchEvent(new Event('visibilitychange'));
  finish(true); await pending;
  assert.equal(f.timers.size, 0);
  f.document.visibilityState = 'visible'; f.navigator.onLine = false;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(calls, 1);
  f.navigator.onLine = true; f.window.dispatchEvent(new Event('online'));
  assert.equal(calls, 2);
  stop(); finish(true); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.timers.size, 0);
  f.window.dispatchEvent(new Event('focus'));
  assert.equal(calls, 2);
});

test('failures back off and successful refresh resets the interval', async () => {
  const f = fixture(); let ok = false;
  const stop = f.start(async () => ok, 8000);
  await f.tick();
  assert.ok([...f.timers.values()][0].delay >= 16000);
  await f.tick();
  assert.ok([...f.timers.values()][0].delay >= 32000);
  ok = true; await f.tick();
  assert.ok([...f.timers.values()][0].delay < 9601);
  stop();
});
