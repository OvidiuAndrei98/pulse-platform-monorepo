import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function mount(enabled = true, interval: number | undefined = 15000) {
  let effect: (() => (() => void) | undefined) | undefined, cleanup: (() => void) | undefined;
  let foreground = true, calls = 0, renders = 0;
  const timers = new Map<number, () => void>(), options: unknown[] = [];
  const refetch = async (value: unknown) => { calls++; options.push(value); };
  const deps: Record<string, unknown> = {
    react: { useCallback: (callback: unknown) => callback },
    '@react-navigation/native': { useFocusEffect: (callback: typeof effect) => { effect = callback; } },
    '@tanstack/react-query': { focusManager: { isFocused: () => foreground } },
  };
  const exports: any = {};
  runInNewContext(ts.transpileModule(readFileSync(resolve(__dirname, '../src/dashboard/useDashboardPolling.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; },
    setInterval: (callback: () => void, delay: number) => { assert.equal(delay, 15000); timers.set(1, callback); return 1; },
    clearInterval: (id: number) => timers.delete(id),
  });
  const render = (active = enabled, delay = interval) => { cleanup?.(); renders++; exports.useDashboardPolling(refetch, active, delay); };
  render();
  return { timers, options, calls: () => calls, renders: () => renders, render,
    focus() { cleanup = effect?.(); }, blur() { cleanup?.(); cleanup = undefined; },
    tick() { for (const callback of timers.values()) callback(); },
    background(value: boolean) { foreground = !value; },
  };
}

test('dashboard polling follows focus without rerendering the workspace', () => {
  const ui = mount();
  ui.tick(); assert.equal(ui.calls(), 0);
  ui.focus(); assert.equal(ui.calls(), 0, 'Focus retains the existing query fetch policy');
  ui.tick(); assert.equal(ui.calls(), 1);
  assert.equal((ui.options[0] as any).cancelRefetch, false, 'In-flight queries are reused');
  ui.blur(); ui.tick(); assert.equal(ui.calls(), 1);
  ui.focus(); ui.tick(); assert.equal(ui.calls(), 2);
  assert.equal(ui.renders(), 1, 'Focus changes run effects without rebuilding the page');
});

test('polling pauses in the background and cannot outlive its enabled workspace', () => {
  const ui = mount(); ui.focus(); ui.background(true); ui.tick(); assert.equal(ui.calls(), 0);
  ui.background(false); ui.tick(); assert.equal(ui.calls(), 1);
  ui.render(false); ui.focus(); ui.tick(); assert.equal(ui.calls(), 1); assert.equal(ui.timers.size, 0);
  ui.render(true); ui.focus(); assert.equal(ui.timers.size, 1);
  ui.blur(); assert.equal(ui.timers.size, 0);
});

test('queries without periodic refresh do not install an interval', () => {
  const ui = mount(true, 0); ui.focus(); ui.tick();
  assert.equal(ui.timers.size, 0); assert.equal(ui.calls(), 0);
});
