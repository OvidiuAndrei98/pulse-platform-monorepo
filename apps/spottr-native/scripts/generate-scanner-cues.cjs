// Original, short UI tones; bundled locally so offline scanning needs no audio download.
const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(__dirname, '../assets/scanner');
fs.mkdirSync(dir, { recursive: true });
const cues = { success: [[0, 0.10, 780], [0.075, 0.13, 1040]], duplicate: [[0, 0.12, 470], [0.17, 0.12, 470]], error: [[0, 0.20, 310], [0.12, 0.17, 245]] };
for (const [name, notes] of Object.entries(cues)) {
  const rate = 22050, count = Math.ceil((Math.max(...notes.map(([start, length]) => start + length)) + 0.025) * rate);
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / rate;
    let sample = 0;
    for (const [start, length, hz] of notes) {
      const elapsed = t - start;
      if (elapsed < 0 || elapsed >= length) continue;
      const envelope = Math.min(1, elapsed / 0.008) * Math.pow(1 - elapsed / length, 1.6);
      sample += Math.sin(2 * Math.PI * hz * elapsed) * envelope * 0.24;
    }
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(dir, name + '.wav'), wav);
}
