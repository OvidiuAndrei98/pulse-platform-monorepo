// Exercise the actual browser decoder and encoder used by profile uploads.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/components/profile/prepareAvatarImage.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const moduleURL = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "spottr-avatar-test-"));
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const child = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
let socket;

async function run() {
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Chrome startup timed out")), 15000);
    child.once("error", reject);
    child.stderr.on("data", (chunk) => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextID = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    const callback = pending.get(message.id);
    if (callback) { pending.delete(message.id); callback(message); }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextID;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, 15000);
    pending.set(id, (message) => { clearTimeout(timeout); message.error ? reject(message.error) : resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const expression = `(async () => {
    const { prepareAvatarImage, MAX_AVATAR_SOURCE_BYTES, MAX_AVATAR_UPLOAD_BYTES } = await import(${JSON.stringify(moduleURL)});
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(1600, 1600);
    const rgb = new Uint8Array(pixels.data.buffer);
    for (let offset = 0; offset < rgb.length; offset += 65536) {
      crypto.getRandomValues(rgb.subarray(offset, Math.min(offset + 65536, rgb.length)));
    }
    for (let i = 3; i < rgb.length; i += 4) rgb[i] = 255;
    ctx.putImageData(pixels, 0, 0);
    const source = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const output = await prepareAvatarImage(new File([source], 'photo.png', {type:'image/png'}));
    const bitmap = await createImageBitmap(output);
    const results = { sourceBytes: source.size, outputBytes: output.size, outputType: output.type, width: bitmap.width, height: bitmap.height };
    bitmap.close();
    try { await prepareAvatarImage(new File([new Uint8Array(MAX_AVATAR_SOURCE_BYTES + 1)], 'large.jpg', {type:'image/jpeg'})); }
    catch (error) { results.largeError = error.code; }
    try { await prepareAvatarImage(new File(['wrong'], 'document.txt', {type:'text/plain'})); }
    catch (error) { results.typeError = error.code; }
    results.maxOutput = MAX_AVATAR_UPLOAD_BYTES;
    return results;
  })()`;
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const value = result.result.value;
  assert.ok(value.sourceBytes > 2 * 1024 * 1024 && value.sourceBytes < 12 * 1024 * 1024, 'Source exceeds old limit');
  assert.equal(value.outputType, 'image/webp');
  assert.ok(value.outputBytes <= value.maxOutput, 'Stored image is bounded');
  assert.ok(value.width <= 1024 && value.height <= 1024, 'Stored dimensions are bounded');
  assert.equal(value.largeError, 'sourceTooLarge');
  assert.equal(value.typeError, 'invalidType');
  console.log('PASS larger photo becomes bounded WebP; oversized and invalid files are rejected');
  await send("Target.closeTarget", { targetId });
  await send("Browser.close");
}

run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  socket?.close();
  if (child.exitCode === null) child.kill();
});
