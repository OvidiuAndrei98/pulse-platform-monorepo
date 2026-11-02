import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import React from 'react';
const { renderToStaticMarkup } = require('react-dom/server') as { renderToStaticMarkup: (node: React.ReactNode) => string };

const { modules } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');
const source = path.resolve(__dirname, '../src');
const context = modules({ react: React }).load(path.join(source, 'preferencesContext.ts'));
const mocks = {
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
  './preferencesContext': context,
  './ui/haptics': { haptic: () => {} },
  '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
  '@tanstack/react-query': { useQuery: () => ({ data: [] }) },
  './auth/AuthProvider': { useAuth: () => ({ user: null, controller: { getToken: () => null } }) },
  './data/queries': { queryClient: {} },
  './ui/ToastProvider': { useToast: () => ({ show: () => {}, clear: () => {} }) },
  './i18n': { translate: (_language: string, key: string) => key },
  './copy': { productCopy: (_language: string, key: string) => key },
};
const loadProvider = () => modules(mocks).load(path.join(source, 'PreferencesProvider.tsx'));
const loadConsumer = () => modules(mocks).load(path.join(source, 'usePreferences.ts'));

test('a refreshed consumer can read preferences from an already mounted provider', () => {
  const before = loadProvider(), refreshedProvider = loadProvider(), refreshed = loadConsumer();
  assert.notEqual(before.PreferencesProvider, refreshedProvider.PreferencesProvider, 'Re-evaluate the provider module, keeping its context dependency cached');
  function RefreshedScreen() {
    const prefs = refreshed.usePreferences();
    assert.equal(prefs.language, 'en');
    assert.equal(prefs.ready, false);
    assert.equal(prefs.copy('qr.startingCamera'), 'qr.startingCamera');
    return React.createElement('span', null, prefs.t('home'));
  }
  assert.equal(renderToStaticMarkup(React.createElement(before.PreferencesProvider, null, React.createElement(RefreshedScreen))), '<span>home</span>');
});

test('refreshing the context module preserves both mounted provider identities', () => {
  const runtime = {};
  const reloadContexts = () => modules({ react: React }, { __DEV__: true, globalThis: runtime })
    .load(path.join(source, 'preferencesContext.ts'));
  const before = reloadContexts(), after = reloadContexts();
  assert.equal(after.PreferencesContext, before.PreferencesContext);
  assert.equal(after.CopyPreferencesContext, before.CopyPreferencesContext);
  const provider = modules({ ...mocks, './preferencesContext': before }).load(path.join(source, 'PreferencesProvider.tsx'));
  const consumer = modules({ ...mocks, './preferencesContext': after }).load(path.join(source, 'usePreferences.ts'));
  function RefreshedScreen() {
    const full = consumer.usePreferences(), copy = consumer.usePreferences('copy');
    assert.equal(full.language, copy.language);
    return React.createElement('span', null, copy.t('home'));
  }
  assert.equal(renderToStaticMarkup(React.createElement(provider.PreferencesProvider, null, React.createElement(RefreshedScreen))), '<span>home</span>');
});

test('production contexts do not reuse a development runtime registry', () => {
  const runtime = {};
  const loadContexts = (dev: boolean) => modules({ react: React }, { __DEV__: dev, globalThis: runtime })
    .load(path.join(source, 'preferencesContext.ts'));
  const dev = loadContexts(true), first = loadContexts(false), second = loadContexts(false);
  assert.notEqual(first.PreferencesContext, dev.PreferencesContext);
  assert.notEqual(first.PreferencesContext, second.PreferencesContext);
  assert.notEqual(first.CopyPreferencesContext, second.CopyPreferencesContext);
});

for (const scope of [undefined, 'copy']) test(`a genuinely missing ${scope ?? 'full'} preferences provider still reports an error`, () => {
  const { usePreferences } = loadConsumer();
  function UnwrappedScreen() { usePreferences(scope); return null; }
  assert.throws(() => renderToStaticMarkup(React.createElement(UnwrappedScreen)), /Missing PreferencesProvider/);
});
