const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hooks, modules, deferred, settle } = require('./helpers/qaHarness.cjs');

function setup({ native = true, available = true, acquire, release } = {}) {
  const react = hooks(), calls = [], listeners = new Map();
  const { useTicketBrightness } = modules({
    react: react.react,
    '@capacitor/core': {
      Capacitor: { isNativePlatform: () => native, isPluginAvailable: () => available },
      registerPlugin: () => ({
        acquire: async options => { calls.push(['acquire', options.id]); return acquire ? acquire(options) : { active: true }; },
        release: async options => { calls.push(['release', options.id]); return release?.(options); },
      }),
    },
  }, {
    window: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
    },
  }).load('lib/native/useTicketBrightness');
  return { render: open => react.render(() => useTicketBrightness(open)), calls, listeners, unmount: react.unmount };
}

test('browser and older native builds never request brightness or claim it is active', async () => {
  for (const options of [{native:false}, {available:false}]) {
    const view = setup(options);
    assert.equal(view.render(true), false);
    await settle();
    assert.equal(view.render(true), false);
    view.unmount();
    assert.deepEqual(view.calls, []);
  }
});

test('closing waits for pending brightness acquire before restoring the same owner', async () => {
  const pending = deferred();
  const view = setup({ acquire: () => pending.promise });
  view.render(true);
  await settle();
  assert.equal(view.calls.length, 1);
  view.render(false);
  await settle();
  assert.equal(view.calls.length, 1, 'Restore must not overtake pending acquire');
  pending.resolve({active:true});
  await settle();
  assert.deepEqual(view.calls, [['acquire',view.calls[0][1]],['release',view.calls[0][1]]]);
  assert.equal(view.render(false), false, 'Late completion must not enable the indicator');
});

test('rapid close and reopen release the old owner before acquiring a new one', async () => {
  const release = deferred();
  const view = setup({ release: () => release.promise });
  view.render(true);
  await settle();
  assert.equal(view.render(true), true);
  view.render(false);
  view.render(true);
  await settle();
  assert.deepEqual(view.calls.map(call=>call[0]), ['acquire','release']);
  release.resolve();
  await settle();
  assert.deepEqual(view.calls.map(call=>call[0]), ['acquire','release','acquire']);
  assert.notEqual(view.calls[0][1],view.calls[2][1]);
});

test('page exit and unmount restore only once', async () => {
  const view = setup();
  view.render(true);
  await settle();
  view.listeners.get('pagehide')();
  view.unmount();
  await settle();
  assert.deepEqual(view.calls.map(call=>call[0]), ['acquire','release']);
  assert.equal(view.listeners.size, 0);
});

test('native errors do not strand the queue or show a false success indicator', async () => {
  let fail = true;
  const view = setup({ acquire: async () => {
    if (fail) throw Error('Native unavailable');
    return {active:true};
  }});
  view.render(true);
  await settle();
  assert.equal(view.render(true), false);
  view.render(false);
  fail = false;
  view.render(true);
  await settle();
  assert.equal(view.render(true), true);
  assert.deepEqual(view.calls.map(call=>call[0]), ['acquire','release','acquire']);
});
