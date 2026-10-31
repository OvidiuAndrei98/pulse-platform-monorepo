import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { isMapCredit, isMapDocument, parseMapMessage } from '../src/map/webview/bridge';

for (const scenario of [
  { name: 'Expo Go', expoGo: true, camera: false, map: false, native: false },
  { name: 'complete native binary', expoGo: false, camera: true, map: true, native: true },
  { name: 'host detection false with missing native camera', expoGo: false, camera: false, map: false, native: false },
  { name: 'partial native binary without map view', expoGo: false, camera: true, map: false, native: false },
]) test(`map startup chooses a safe renderer in ${scenario.name}`, () => {
  const source = readFileSync(new URL('../src/map/EventMap.tsx', import.meta.url), 'utf8');
  const code = transformSync(source, { loader: 'tsx', format: 'cjs' }).code;
  const Renderer = () => null, module = { exports: {} as { EventMap?: unknown } };
  const requested: string[] = [];
  const probes: string[] = [];
  runInNewContext(code, { module, exports: module.exports, require(id: string) {
    requested.push(id);
    if (id === 'expo') return { isRunningInExpoGo: () => scenario.expoGo };
    if (id === 'react-native') return { TurboModuleRegistry: { get(name: string) {
      probes.push(name);
      if (name === 'MLRNCameraModule') return scenario.camera ? {} : null;
      if (name === 'MLRNMapViewModule') return scenario.map ? {} : null;
      throw new Error('Unexpected native capability: ' + name);
    } } };
    if (id === (scenario.native ? './EventMapNative' : './EventMapExpoGo')) return { EventMapExpoGo: Renderer, EventMapNative: Renderer };
    throw new Error(`Unavailable native module evaluated: ${id}`);
  } });
  assert.equal(module.exports.EventMap, Renderer);
  assert.deepEqual(requested, ['expo', 'react-native', scenario.native ? './EventMapNative' : './EventMapExpoGo']);
  if (scenario.expoGo) assert.deepEqual(probes, [], 'Expo Go never probes or imports the native package');
  else assert.deepEqual(probes, scenario.camera ? ['MLRNCameraModule', 'MLRNMapViewModule'] : ['MLRNCameraModule']);
});

test('map bridge accepts valid viewport and selection messages, rejects malformed coordinates', () => {
  assert.deepEqual(parseMapMessage('{"type":"viewport","center":{"latitude":44,"longitude":26},"zoom":18}'), {
    type: 'viewport', center: { latitude: 44, longitude: 26 }, zoom: 18,
  });
  assert.deepEqual(parseMapMessage('{"type":"point","point":{"x":12,"y":30}}'), { type: 'point', point: { x: 12, y: 30 } });
  assert.deepEqual(parseMapMessage('{"type":"select","id":null}'), { type: 'select', id: null });
  for (const raw of ['null', '{', '[]', '{"type":"ready2"}', '{"type":"error","failed":"true"}',
    '{"type":"viewport","center":{"latitude":95,"longitude":26},"zoom":18}',
    '{"type":"viewport","center":{"latitude":44,"longitude":26},"zoom":100}',
    '{"type":"point","point":{"x":"12","y":30}}', '{"type":"select","id":1}']) {
    assert.equal(parseMapMessage(raw), null, raw);
  }
});

test('map document and attribution navigation are limited to the intended destinations', () => {
  assert.equal(isMapDocument('about:blank'), true);
  assert.equal(isMapDocument('https://spottr-map.invalid/'), true);
  assert.equal(isMapDocument('https://spottr-map.invalid.evil.test/'), false);
  assert.equal(isMapCredit('https://www.openstreetmap.org/copyright'), true);
  for (const url of ['javascript:alert(1)', 'https://evil.test', 'https://openfreemap.org.evil.test/', 'https://user:pass@openfreemap.org/']) {
    assert.equal(isMapCredit(url), false);
  }
});
