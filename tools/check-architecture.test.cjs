const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { checkSource } = require('./check-architecture.cjs');
const file = relative => path.resolve(__dirname, '..', relative);
test('architecture rejects cross-app runtime, type, export and dynamic imports', () => {
  for (const source of ["import type {X} from '../../../pulse-app/src/secret'", "export {X} from '../../../pulse-app/src/secret'", "import('../../../pulse-app/src/secret')", "require('../../../pulse-app/src/secret')"]) assert.ok(checkSource(file('apps/spottr-native/src/data/a.ts'), source).length, source);
});
test('architecture rejects private package paths and platform globals in core', () => {
  for (const source of ["import {X} from '@packages/api-client/src/Client'", "document.cookie", "fetch('/api')", "process.env.SECRET", "globalThis.fetch('/api')", "globalThis['process'].env.SECRET", "import { useEffect } from 'react'", "import fs from 'node:fs'"]) assert.ok(checkSource(file('packages/app-core/src/example.ts'), source).length, source);
});
test('architecture accepts declared type contracts and escaped HTML as data', () => {
  assert.deepEqual(checkSource(file('packages/app-core/src/example.ts'), "import type { ReadableSchema } from '@packages/api-client/schema-types'; const html = '<p>document</p>';"), []);
});
test('contracts cannot pull in a transport and browser adapters cannot own a React runtime',()=>{
  assert.ok(checkSource(file('packages/app-core/src/example.ts'),"import type {ApiClient} from '@packages/api-client/client'").length);
  assert.ok(checkSource(file('packages/browser-core/src/example.ts'),"import {useEffect} from 'react'").length);
});
