// Original, synthesized selection tick. No Apple audio assets are used.
const fs = require('node:fs'), path = require('node:path');
const rate = 44100, count = Math.round(rate * 0.018), pcm = Buffer.alloc(count * 2);
let seed = 1729, previous = 0;
for (let index = 0; index < count; index++) {
  const time = index / rate;
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const noise = seed / 0xffffffff * 2 - 1, bright = noise - previous; previous = noise;
  const attack = Math.min(1, time / 0.0003);
  const sample = attack * (0.2 * Math.sin(2 * Math.PI * 1600 * time) * Math.exp(-time / 0.0012)
    + 0.13 * Math.sin(2 * Math.PI * 680 * time) * Math.exp(-time / 0.0025)
    + 0.1 * bright * Math.exp(-time / 0.0008));
  pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), index * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
const directory = path.resolve(__dirname, '../assets/audio'); fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'date-tick.wav'), Buffer.concat([header, pcm]));
console.log('Generated date-tick.wav: 18ms mono PCM');
