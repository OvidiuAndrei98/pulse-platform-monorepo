const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const artifacts = path.resolve(__dirname, '../artifacts');
const profileRoot = path.join(artifacts, '.chrome-profiles');
const exited = child => !child?.pid || child.exitCode !== null || child.signalCode !== null;

function waitForExit(child, milliseconds) {
  if (exited(child)) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = value => { clearTimeout(timer); child.removeListener('exit', onExit); resolve(value); };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(false), milliseconds);
    child.once('exit', onExit);
    if (exited(child)) finish(true);
  });
}

// The closure owns exactly one mkdtemp directory. Screenshots and failure logs
// live outside profileRoot and can never be deleted by this cleanup.
function createChromeProfile(prefix, resources = () => ({})) {
  if (!/^[a-z][a-z0-9-]*$/.test(prefix)) throw new Error('INVALID_CHROME_PROFILE_PREFIX');
  fs.mkdirSync(profileRoot, { recursive: true });
  const realArtifacts = fs.realpathSync(artifacts);
  const realRoot = fs.realpathSync(profileRoot);
  const realApp = fs.realpathSync(path.resolve(__dirname, '..'));
  if (fs.lstatSync(artifacts).isSymbolicLink() || path.dirname(realArtifacts) !== realApp ||
      fs.lstatSync(profileRoot).isSymbolicLink() || path.dirname(realRoot) !== realArtifacts) {
    throw new Error('UNSAFE_CHROME_PROFILE_ROOT');
  }
  const profile = fs.mkdtempSync(path.join(realRoot, prefix + '-'));
  const originalPath = fs.realpathSync(profile);
  let cleanupPromise;
  const cleanup = () => cleanupPromise ??= (async () => {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    const { child, socket, server } = resources();
    try {
      if (!exited(child) && socket?.readyState === 1) {
        // Browser-level CDP closes renderer children and flushes profile handles.
        try { socket.send(JSON.stringify({ id: -1, method: 'Browser.close' })); } catch {}
        await waitForExit(child, 3000);
      }
      if (!exited(child)) {
        if (process.platform === 'win32') {
          // Only the process tree spawned by this test; never kill by image name.
          await new Promise(resolve => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve()));
        } else child.kill('SIGTERM');
        if (!await waitForExit(child, 3000)) {
          child.kill('SIGKILL');
          if (!await waitForExit(child, 2000)) throw new Error('CHROME_DID_NOT_EXIT');
        }
      }
      if (!fs.existsSync(profile)) return;
      const current = fs.realpathSync(profile);
      if (fs.lstatSync(profile).isSymbolicLink() || current !== originalPath ||
          path.dirname(current) !== realRoot || path.resolve(profile) !== originalPath ||
          !path.basename(current).startsWith(prefix + '-')) {
        throw new Error('UNSAFE_CHROME_PROFILE_DELETE');
      }
      await fs.promises.rm(current, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    } catch (error) {
      console.error('Chrome profile cleanup failed:', profile, error);
      process.exitCode = process.exitCode || 1;
    } finally {
      try { socket?.close(); } catch {}
      server?.close();
      server?.closeAllConnections?.();
    }
  })();
  const interrupt = () => { void cleanup().finally(() => process.exit(130)); };
  const terminate = () => { void cleanup().finally(() => process.exit(143)); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  return { path: profile, cleanup };
}

module.exports = { createChromeProfile };
