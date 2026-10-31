import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { homeEventsQueryOptions } from '../src/data/queries';

const { hooks, modules, deferred } = require('../../pulse-app/scripts/helpers/qaHarness.cjs');

function actionFixture(client: QueryClient) {
  const hook = hooks();
  let token = 'organizer-a';
  const { useAction } = modules({
    react: hook.react,
    'react-native': { StyleSheet: { create: (value: unknown) => value } },
    '@tanstack/react-query': { useQueryClient: () => client },
    '@react-navigation/native': {},
    'lucide-react-native': {},
    '../auth/AuthProvider': { accountApi() {}, useAuth: () => ({ user: { id: 'organizer-a' }, controller: { getToken: () => token } }) },
    '../usePreferences': { usePreferences: () => ({ copy: (key: string) => key }) },
    '../ui/Text': {}, '../ui/FormInput': { formStyles: {} }, '../ui/theme': { colors: {} },
    '../ui/AccentPressable': { AccentPressable: 'Pressable' },
    '../ui/ActionButton': {}, '../ui/Surface': {}, '../ui/AppModal': {}, '../ui/Field': {},
    './DashboardDropdown': {}, './data': { createDashboardApi: () => ({}) },
  }).load('../../spottr-native/src/dashboard/common.tsx');
  return { run: (...args: unknown[]) => hook.render(useAction).run(...args),
    switchAccount: () => { token = 'organizer-b'; }, cleanup: () => hook.unmount() };
}

test('an organizer save refreshes the mounted Home cache and invalidates event/profile details', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let title = 'Before save', requests = 0;
  const api = { page: async () => { requests++; return { items: [{ id: 'event-a', title }], rawCount: 1, page: 1 }; } };
  const options = homeEventsQueryOptions(api as any);
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  const fixture = actionFixture(client);
  try {
    await observer.refetch();
    client.setQueryData(['event', 'event-a'], { title });
    client.setQueryData(['profile', 'organizer-a'], { username: 'Before' });
    const before = requests;
    title = 'After save';
    await fixture.run(async () => ({ id: 'event-a', title }));
    for (let tick = 0; tick < 20 && client.isFetching(); tick++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(observer.getCurrentResult().data?.[0]?.title, 'After save');
    assert.equal(requests, before + 1, 'A successful mutation refreshes Home once');
    assert.equal(client.getQueryState(['event', 'event-a'])?.isInvalidated, true);
    assert.equal(client.getQueryState(['profile', 'organizer-a'])?.isInvalidated, true);
  } finally { fixture.cleanup(); unsubscribe(); client.clear(); }
});

test('dashboard actions ignore duplicate taps and cannot publish a result into another account', async () => {
  const client = new QueryClient(), fixture = actionFixture(client), pending = deferred();
  client.setQueryData(['home-events'], [{ id: 'event-a', title: 'Original' }]);
  let requests = 0, callbacks = 0;
  try {
    const first = fixture.run(() => { requests++; return pending.promise; }, undefined, () => { callbacks++; });
    await fixture.run(async () => { requests++; });
    assert.equal(requests, 1);
    fixture.switchAccount();
    pending.resolve({ id: 'event-a' });
    await first;
    assert.equal(callbacks, 0);
    assert.equal(client.getQueryState(['home-events'])?.isInvalidated, false);
    await fixture.run(async () => { throw new Error('Server failure'); });
    assert.equal(client.getQueryState(['home-events'])?.isInvalidated, false);
  } finally { fixture.cleanup(); client.clear(); }
});
