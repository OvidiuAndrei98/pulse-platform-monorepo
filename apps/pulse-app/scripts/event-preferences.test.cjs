const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hooks, modules, deferred, settle, find } = require('./helpers/qaHarness.cjs');

function preferences({ hidden = [], hide, show } = {}) {
  const hook = hooks(), counts = [], errors = [];
  const user = {
    properties: { id: 'user-1' },
    hideEventCategory: hide ?? (async () => {}),
    showEventCategory: show ?? (async () => {}),
  };
  const { HiddenEventCategories } = modules({
    react: hook.react,
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    sonner: { toast: { error: message => errors.push(message) } },
    '@/core/mappers': { eventCategories: ['TECHNO', 'HOUSE'] },
    '@/core/DataProviderContext': { useDataProvider: () => ({ user }) },
    '@/lib/useClientQuery': { useClientQuery: () => ({ data: hidden, pending: false, error: null }) },
    '@/components/ui/RequestFeedback': { RequestError: 'RequestError' },
    '@/components/ui/drawer': Object.fromEntries(
      ['Drawer', 'DrawerContent', 'DrawerDescription', 'DrawerHandleOverlay', 'DrawerTitle'].map(name => [name, name]),
    ),
  }).load('components/profile/HiddenEventCategories');
  const props = {
    open: true, onOpenChange: () => {}, onHiddenCountChange: count => counts.push(count),
    returnFocusRef: { current: null },
  };
  const render = () => hook.render(() => {
    const child = HiddenEventCategories(props);
    return child.type(child.props);
  });
  const button = (tree, category) => find(tree, node => node.type === 'button' && node.props.children?.includes(category));
  return { render, button, props, counts, errors };
}

test('closing and reopening preferences during saving keeps optimistic selection and count', async () => {
  const save = deferred();
  let calls = 0;
  const view = preferences({ hide: () => { calls++; return save.promise; } });
  view.button(view.render(), 'TECHNO').props.onClick();
  view.props.open = false;
  assert.equal(view.render().props.open, false);
  view.props.open = true;
  assert.equal(view.button(view.render(), 'TECHNO').props['aria-pressed'], true);
  assert.equal(view.counts.at(-1), 1);
  save.resolve();
  await settle();
  assert.equal(view.button(view.render(), 'TECHNO').props['aria-pressed'], true);
  assert.equal(calls, 1);
});

test('rapid toggles across drawer openings save the latest choice in order', async () => {
  const save = deferred(), calls = [];
  const view = preferences({
    hide: () => { calls.push('hide'); return save.promise; },
    show: async () => { calls.push('show'); },
  });
  view.button(view.render(), 'TECHNO').props.onClick();
  view.props.open = false;
  view.render();
  view.props.open = true;
  view.button(view.render(), 'TECHNO').props.onClick();
  assert.equal(view.button(view.render(), 'TECHNO').props['aria-pressed'], false);
  assert.equal(view.counts.at(-1), 0);
  assert.deepEqual(calls, ['hide']);
  save.resolve();
  await settle();
  assert.deepEqual(calls, ['hide', 'show']);
  assert.equal(view.button(view.render(), 'TECHNO').props['aria-pressed'], false);
});

test('failed saves roll back selection and profile count while the drawer is closed', async () => {
  const save = deferred();
  const view = preferences({ hidden: ['HOUSE'], hide: () => save.promise });
  view.button(view.render(), 'TECHNO').props.onClick();
  view.props.open = false;
  view.render();
  assert.equal(view.counts.at(-1), 2);
  save.reject(new Error('offline'));
  await settle();
  view.render();
  assert.equal(view.counts.at(-1), 1);
  view.props.open = true;
  const tree = view.render();
  assert.equal(view.button(tree, 'TECHNO').props['aria-pressed'], false);
  assert.equal(view.button(tree, 'HOUSE').props['aria-pressed'], true);
  assert.deepEqual(view.errors, ['feedback.actionFailed']);
});
