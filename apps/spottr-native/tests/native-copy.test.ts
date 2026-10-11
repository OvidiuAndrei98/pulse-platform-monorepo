import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resources } from '../../pulse-app/src/i18n/resources';

test('native screens resolve literal product translations in both languages', () => {
  const namespaces = new Set(Object.keys(resources.en.translation));
  const files = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : []);
  const missing: string[] = [];
  for (const file of files(join(import.meta.dirname, '../src'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/['"]([a-zA-Z]+\.[\w.]+)['"]/g)) {
      const key = match[1]!;
      if (key.endsWith('.') || /\.(com|net|org)$/.test(key) || !namespaces.has(key.split('.')[0]!)) continue;
      for (const language of ['en', 'ro'] as const) {
        const lookup = (key: string) => key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, resources[language].translation);
        if (lookup(key) === undefined && lookup(key + '_other') === undefined) missing.push(`${file.split('src')[1]}:${language}:${key}`);
      }
    }
  }
  assert.deepEqual([...new Set(missing)], []);
});


test('zero uses the plural translation when no explicit zero text exists', async () => {
  const {productCopy}=await import('../src/copy');
  assert.equal(productCopy('en','promoCodes.activeCount',{count:0}),'0 active codes');
  assert.equal(productCopy('ro','promoCodes.activeCount',{count:0}),'0 coduri active');
  assert.equal(productCopy('en','promoCodes.activeCount',{count:1}),'1 active code');
  assert.equal(productCopy('en','promoCodes.activeCount',{count:2}),'2 active codes');
});
test('explicit zero translations are preserved, including the Home empty state', async () => {
  const {productCopy}=await import('../src/copy');
  for(const language of ['en','ro'] as const) assert.equal(productCopy(language,'home.exploreTonight',{count:0}),resources[language].translation.home.exploreTonight_zero);
});
