const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hooks, modules, deferred, settle, find } = require('./helpers/qaHarness.cjs');

const update = id => ({ id, imageUrl: `/${id}.webp`, expiresAt: '2099-10-06T20:00:00Z' });
function manager() {
  const hook = hooks(), saved = deferred();
  const state = { updates: [update('existing')], creates: 0, uploads: 0, errors: [] };
  const user = {
    properties: { id: 'organizer' },
    uploadOrganizerUpdateImage: async () => { state.uploads++; return { url: '/new.webp' }; },
    createEventUpdate: async () => { state.creates++; return saved.promise; },
    deleteEventUpdate: async (_, id) => { state.updates = state.updates.filter(item => item.id !== id); },
  };
  const { OrganizerUpdatesManager } = modules({
    react: hook.react,
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    sonner: { toast: { success: () => {}, error: text => state.errors.push(text) } },
    '@/core/DataProviderContext': { useDataProvider: () => ({ user }) },
    '@/core/DataProvider': { User: {
      useEventUpdates: () => ({ updates: state.updates, updatesLoading: false }),
      useOrganizerUpdates: () => ({ updates: state.updates }),
    } },
  }).load('app/dashboard/components/OrganizerUpdatesManager');
  const render = () => hook.render(() => OrganizerUpdatesManager({ eventId: 'event', status: 'published', endTime: '2099-10-06T22:00:00Z' }));
  render();
  find(render(), n => n.type === 'input').props.onChange({ target: { files: [{ name: 'new.webp', type: 'image/webp', size: 100 }] } });
  const publish = () => find(render(), n => n.type === 'button' && n.props.children?.includes('organizerUpdates.publish')).props.onClick;
  const images = () => {
    const result = [];
    const visit = n => { if (!n || typeof n !== 'object') return; if (n.type === 'img') result.push(n.props.src); [n.props?.children].flat(Infinity).forEach(visit); };
    visit(render()); return result;
  };
  return { state, saved, render, publish, images };
}

test('cache refresh before publish resolves displays the created update exactly once', async () => {
  const view = manager();
  const pending = view.publish()();
  await settle();
  // createEventUpdate refreshes subscribers before returning the POST result.
  view.state.updates = [update('new'), update('existing')];
  view.render(); view.render();
  view.saved.resolve(update('new'));
  await pending;
  assert.deepEqual(view.images(), ['/new.webp', '/existing.webp']);
  assert.equal(view.state.creates, 1);
});

test('rapid publish taps start only one upload and create request; failure unlocks retry', async () => {
  const view = manager(), publish = view.publish();
  const first = publish(), second = publish();
  await settle();
  assert.equal(view.state.uploads, 1);
  assert.equal(view.state.creates, 1);
  view.saved.reject(new Error('offline'));
  await Promise.all([first, second]);
  assert.deepEqual(view.images(), ['/existing.webp']);
  await view.publish()();
  assert.equal(view.state.uploads, 2);
});

test('deleting an update follows the refreshed list without restoring a stale local copy', async () => {
  const view = manager();
  await find(view.render(), n => n.type === 'button' && n.props['aria-label'] === 'organizerUpdates.delete').props.onClick();
  view.render();
  assert.deepEqual(view.images(), []);
});
