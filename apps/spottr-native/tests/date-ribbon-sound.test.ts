import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const { hooks, modules, deferred, settle } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

test('selection audio is lazy, respects silent mode, has no queue and never plays after close', async () => {
  const h = hooks(), seeks: any[] = [], players: any[] = [], modes: any[] = [];
  const app = { currentState: 'active' };
  const { useDateRibbonSound } = modules({
    react: h.react, 'react-native': { AppState: app }, expo: { requireOptionalNativeModule: () => ({}) },
    '../../assets/audio/date-tick.wav': 1,
    'expo-audio': { setAudioModeAsync: async (mode: any) => modes.push(mode), createAudioPlayer: () => {
      const p = { isLoaded: true, volume: 0, plays: 0, removed: false, play() { this.plays++; }, remove() { this.removed = true; },
        seekTo: () => { const seek = deferred(); seeks.push(seek); return seek.promise; } };
      players.push(p); return p;
    } },
  }).load(path.resolve(__dirname, '../src/screens/useDateRibbonSound.ios.ts'));
  let enabled = false, tick: () => void;
  const render = () => { tick = h.render(() => useDateRibbonSound(enabled)); };
  render(); assert.equal(players.length, 0, 'No player allocation during initial tab/login render');
  enabled = true; render(); await settle();
  assert.equal(players.length, 1); assert.equal(modes[0].playsInSilentMode, false); assert.equal(modes[0].interruptionMode, 'mixWithOthers');
  tick!(); tick!(); assert.equal(seeks.length, 1, 'No overlapping seeks or backlog');
  seeks[0].resolve(); await settle(); assert.equal(players[0].plays, 1);
  tick!(); enabled = false; render(); seeks[1].resolve(); await settle();
  assert.equal(players[0].plays, 1); assert.equal(players[0].removed, true);
  enabled = true; render(); await settle();
  app.currentState = 'background'; tick!(); assert.equal(seeks.length, 2, 'No tick in background');
  h.unmount(); assert.equal(players[1].removed, true);
});

test('the bundled tick is an original, short mono PCM asset', () => {
  const wav = readFileSync(path.resolve(__dirname, '../assets/audio/date-tick.wav'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt16LE(34), 16);
  const duration = wav.readUInt32LE(40) / wav.readUInt32LE(28);
  assert.ok(duration > 0.01 && duration < 0.025);
  assert.ok(wav.length < 2000);
});
