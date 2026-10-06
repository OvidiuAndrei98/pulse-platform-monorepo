const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hooks, modules, deferred, settle, find } = require('./helpers/qaHarness.cjs');
const clientPath = '../../../packages/api-client/src/Client.ts';

test('event cards, map and details reference an existing fallback image when a banner is absent', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const file of ['components/EventCard.tsx', 'features/events/components/EventMapSidebar.tsx',
    'features/events/components/EventBrowseCard.tsx', 'features/events/home/PromotedEventsHeroCarousel.tsx',
    'app/events/[id]/EventDetailsPageClient.tsx', 'features/events/map/SelectedEventPopup.tsx']) {
    const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
    const matches = [...source.matchAll(/event\.bannerUrl\s*\|\|\s*["']([^"']+)["']/g)];
    assert.ok(matches.length > 0, file + ' must supply a fallback');
    for (const [, fallback] of matches) assert.ok(fs.existsSync(path.join(__dirname, '../public', fallback)), file + ': ' + fallback);
  }
});

test('discovery fetches page two, keeps filters and tolerates null/empty final pages', async () => {
  const { loadEventPages } = modules().load('features/events/loadEventPages');
  for (const count of [0, 1, 20, 21, 100, 101]) {
    const all = Array.from({ length: count }, (_, id) => ({ id: String(id) }));
    const pages = [];
    const result = await loadEventPages(async page => { pages.push(page); return all.slice((page - 1) * 20, page * 20); }, 20);
    assert.equal(result.length, count);
    assert.equal(pages.length, Math.floor(count / 20) + 1);
  }
  assert.equal((await loadEventPages(async () => null, 20)).length, 0);
  await assert.rejects(loadEventPages(async () => ({ items: [] }), 20), /INVALID_EVENT_LIST/);
});

test('pagination does not loop forever or report a partial list when a page fails', async () => {
  const { loadEventPages } = modules().load('features/events/loadEventPages');
  await assert.rejects(loadEventPages(async () => [{ id: '1' }], 1), /PAGINATION_STALLED/);
  await assert.rejects(loadEventPages(async page => { if (page === 2) throw Error('offline'); return [{ id: '1' }]; }, 1), /offline/);
});

test('public events service forwards filters on every page, including organizer page size', async () => {
  for (const organizerId of [undefined, 'organizer']) {
    const requests = [], size = organizerId ? 100 : 20;
    const { PublicEventsService } = modules({
      './apiRoot': { apiRoot: 'https://api.test' },
      '@packages/api-client/src/Client': { ApiClient: { instance: { get: async (path, options) => {
        requests.push(options.params.query);
        return Array.from({ length: options.params.query.page === 1 ? size : 1 }, (_, i) => ({ id: `${options.params.query.page}-${i}` }));
      } } } }, '@/lib/clientQueryCache': {}, '@/lib/useCachedClientQuery': {},
    }).load('core/DataProvider');
    assert.equal((await PublicEventsService.getPublicEvents({ city: 'Cluj', organizerId })).length, size + 1);
    assert.equal(requests.length, 2);
    requests.forEach((query, i) => { assert.equal(query.city, 'Cluj'); assert.equal(query.organizerId, organizerId); assert.equal(query.page, i + 1); });
  }
});

test('Sunday weekend includes the current Sunday, Saturday and Monday retain correct ranges', () => {
  for (const [today, start, end] of [['2026-10-04', 3, 5], ['2026-10-03', 3, 5], ['2026-10-05', 10, 12]]) {
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [today + 'T12:00:00'])); } }
    const { getEventDateRange } = modules({}, { Date: Clock }).load('features/events/dateFilters');
    const range = getEventDateRange('This weekend');
    assert.equal(new Date(range.startsAfter).getDate(), start);
    assert.equal(new Date(range.startsBefore).getDate(), end);
    assert.equal(Object.keys(getEventDateRange(undefined)).length, 0);
  }
});

test('pulled ticket availability excludes sold out, future, expired and malformed tiers at exact boundaries', () => {
  const api = modules({ react: {}, 'react-i18next': {}, '@/features/events/serviceFee': {} }).load('features/checkout/TicketTypeSelector');
  const now = Date.parse('2026-10-03T12:00:00Z');
  const ticket = { id: 'tier', capacity: 10, ticketsSold: 9, startSales: '2026-10-03T12:00:00Z', endSales: '2026-10-04T12:00:00Z' };
  assert.equal(api.getTicketAvailability(ticket, now), 'available');
  assert.equal(api.getTicketAvailability(ticket, null), 'checking');
  assert.equal(api.getTicketAvailability(ticket, now - 1), 'sales-not-started');
  assert.equal(api.getTicketAvailability(ticket, Date.parse(ticket.endSales)), 'sales-ended');
  assert.equal(api.getTicketAvailability({ ...ticket, ticketsSold: 10 }, now), 'sold-out');
  for (const capacity of [undefined, null, NaN, -1, 0]) assert.notEqual(api.getTicketAvailability({ ...ticket, capacity }, now), 'available');
  for (const startSales of ['', 'invalid', undefined]) assert.notEqual(api.getTicketAvailability({ ...ticket, startSales }, now), 'available');
  for (const quantity of [0, -1, 0.5, 2, NaN, Infinity, null, undefined]) assert.equal(api.isTicketSelectionAvailable([ticket], { tier: quantity }, now), false);
  assert.equal(api.isTicketSelectionAvailable([ticket], { tier: 1 }, now), true);
  assert.equal(api.isTicketSelectionAvailable([ticket], { missing: 1 }, now), false);
});

function promoHarness() {
  const h = hooks(), requests = [];
  class ApiError extends Error { constructor(status) { super('request failed'); this.status = status; } }
  const { useEventPromoCode } = modules({ react: h.react, '@packages/api-client/src/Client': {
    ApiError, ApiClient: { instance: { post: () => { const request = deferred(); requests.push(request); return request.promise; } } },
  } }).load('features/events/useEventPromoCode');
  let event = 'event-a';
  h.render(() => useEventPromoCode(event));
  return { h, requests, ApiError, changeEvent: value => { event = value; h.render(); } };
}

test('promo ignores an old success after user types a new code and prevents duplicate submit', async () => {
  const { h, requests } = promoHarness();
  h.render().setCode('first');
  const hook = h.render(), first = hook.apply();
  await hook.apply();
  assert.equal(requests.length, 1);
  h.render().setCode('second');
  const second = h.render().apply();
  requests[0].resolve({ code: 'FIRST', discountPercent: 5 });
  assert.equal(await first, null);
  assert.equal(h.render().code, 'SECOND');
  assert.equal(h.render().isValidating, true);
  requests[1].resolve({ code: 'SECOND', discountPercent: 10 });
  await second;
  assert.equal(h.render().applied.code, 'SECOND');
  assert.equal(h.render().isValidating, false);
});

test('promo clears stale responses on event changes/unmount and handles invalid inputs and failures', async () => {
  for (const invalidate of ['event', 'unmount', 'clear']) {
    const { h, requests, changeEvent } = promoHarness();
    h.render().setCode('FIRST'); const pending = h.render().apply();
    if (invalidate === 'event') changeEvent('event-b');
    if (invalidate === 'unmount') h.unmount();
    if (invalidate === 'clear') h.render().clear();
    requests[0].resolve({ code: 'FIRST', discountPercent: 5 });
    assert.equal(await pending, null);
  }
  const { h, requests, ApiError } = promoHarness();
  assert.equal(await h.render().apply(), null);
  assert.equal(requests.length, 0);
  for (const [status, error] of [[400, 'invalid'], [500, 'unavailable']]) {
    h.render().setCode('test'); const pending = h.render().apply(); requests.at(-1).reject(new ApiError(status));
    await pending; assert.equal(h.render().error, error); assert.equal(h.render().isValidating, false);
  }
});

test('authenticated 401 expires the current session before throwing, but never expires a newer session or credential form', async () => {
  const response = deferred(); let token = 'old', expired = [];
  const { ApiClient } = modules({}, { fetch: () => response.promise }).load(clientPath);
  ApiClient.configure({ apiRoot: 'https://api.test', getAccessToken: () => token, onUnauthorized: value => expired.push(value) });
  const old = ApiClient.instance.get('/users/me'); token = 'new';
  response.resolve({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) });
  await assert.rejects(old); assert.equal(expired.length, 0);
  await assert.rejects(ApiClient.instance.get('/users/me')); assert.equal(expired.join(','), 'new');
  await assert.rejects(ApiClient.instance.post('/auth/login', { body: {} }));
  await assert.rejects(ApiClient.instance.delete('/users/me', { body: {} }));
  assert.equal(expired.length, 1);
});

test('native storage logout wins over an in-flight token hydration and queued saves', async () => {
  const read = deferred(), save = deferred(), disk = new Map();
  const storage = modules({
    '@capacitor/preferences': { Preferences: { get: async ({ key }) => ({ value: disk.get(key) }), set: async ({ key, value }) => disk.set(key, value), remove: async ({ key }) => disk.delete(key) } },
    '@aparajita/capacitor-secure-storage': { SecureStorage: { getItem: () => read.promise, setItem: async (key, value) => { await save.promise; disk.set(key, value); }, removeItem: async key => disk.delete(key) } },
    '@/lib/native/platform': { isNativePlatform: () => true },
  }).load('lib/native/sessionStorage');
  const hydration = storage.hydrateAccessToken(); await settle();
  const saving = storage.saveAccessToken('new');
  const savingProfile = storage.saveOfflineSession({ id: 'user' });
  const clearing = storage.clearAccessToken();
  const clearingProfile = storage.clearOfflineSession();
  read.resolve('old'); assert.equal(await hydration, null);
  save.resolve(); await Promise.all([saving, savingProfile, clearing, clearingProfile]);
  assert.equal(storage.getAccessTokenSync(), null); assert.equal(disk.size, 0);
});

function sessionHarness({ failure, cached, token = 'token', storageFailure = false } = {}) {
  const h = hooks(), response = deferred(), saved = [], window = new EventTarget();
  const storage = {
    getAccessTokenSync: () => token,
    hydrateAccessToken: async () => { if (storageFailure) throw Error('storage unavailable'); return token; },
    clearAccessToken: async () => { token = null; }, clearOfflineSession: async () => { cached = undefined; },
    readOfflineSession: async () => cached, saveAccessToken: async value => { token = value; },
    saveOfflineSession: async value => { cached = value; saved.push(value); },
  };
  class ApiError extends Error { constructor(status) { super('request failed'); this.status = status; } }
  const i18n = { changeLanguage: async () => {} };
  const { DataProvider } = modules({
    react: h.react, 'next/navigation': { usePathname: () => '/', useRouter: () => ({ push() {} }) },
    'react-i18next': { useTranslation: () => ({ t: key => key, i18n }) },
    './DataProvider': { User: class { constructor(properties) { this.properties = properties; } }, clearSessionCaches() {} },
    '@/lib/native/apiFetch': { apiFetch() {} },
    './apiRoot': { apiRoot: 'https://test' }, '@/components/ui/loading': {}, '@/lib/native/sessionStorage': storage,
    '@packages/api-client/src/Client': { ApiError, ApiClient: { configure() {}, instance: { get: () => failure ? Promise.reject(new ApiError(failure)) : response.promise } } },
  }, { window, navigator: { onLine: true } }).load('core/DataProviderContext');
  const render = () => h.render(() => DataProvider({ children: null })).props.value;
  render();
  return { h, render, response, saved, storage, window };
}

test('late session reload cannot resurrect user or offline cache after logout', async () => {
  const s = sessionHarness(); await settle();
  s.render().logout();
  s.response.resolve({ id: 'old-user', role: 'user' }); await settle();
  assert.equal(s.render().user, undefined); assert.equal(s.saved.length, 0);
  assert.equal(s.render().loading, false); assert.equal(s.storage.getAccessTokenSync(), null);
  s.render().updateSessionUser({ id: 'old-user' }); assert.equal(s.render().user, undefined);
});

test('server failures preserve the token and cached session; invalid auth clears both', async () => {
  for (const failure of [500, 503, 429, 401, 403, 404]) {
    const s = sessionHarness({ failure, cached: { id: 'user', role: 'user' } }); await settle();
    const invalid = [401, 403, 404].includes(failure);
    assert.equal(s.storage.getAccessTokenSync(), invalid ? null : 'token');
    assert.equal(s.render().user?.properties.id, invalid ? undefined : 'user');
    assert.equal(s.render().loading, false);
  }
});

test('storage failure exits loading and exposes a recoverable error', async () => {
  const s = sessionHarness({ storageFailure: true }); await settle();
  assert.equal(s.render().loading, false); assert.match(s.render().error.message, /storage/);
});

test('banner upload failure restores the saved image and does not change the submitted value', async () => {
  const h = hooks(), request = deferred(), changed = [], revoked = [];
  const { EventBannerUpload } = modules({ react: h.react, 'react-i18next': { useTranslation: () => ({ t: key => key }) },
    '@packages/api-client/src/Client': { ApiClient: { instance: { uploadEventBanner: () => request.promise } } },
  }, { URL: { createObjectURL: () => 'blob:preview', revokeObjectURL: value => revoked.push(value) } }).load('features/events/form/EventBannerUpload');
  const render = () => h.render(() => EventBannerUpload({ value: 'saved.webp', onChange: value => changed.push(value) }));
  const pending = find(render(), node => node.type === 'input').props.onChange({ target: { files: [{ type: 'image/jpeg', size: 512 }], value: 'file' } });
  assert.equal(find(render(), node => node.type === 'img').props.src, 'blob:preview');
  request.reject(Error('Upload failed')); await pending;
  assert.equal(find(render(), node => node.type === 'img').props.src, 'saved.webp');
  assert.equal(changed.length, 0); assert.equal(revoked.includes('blob:preview'), true);
});

test('language update handles network errors, unlocks retry and prevents duplicate requests', async () => {
  const h = hooks(), request = deferred(), errors = []; let calls = 0, changed = 0;
  const user = { properties: { id: 'user' }, updateProfile: () => { calls++; return request.promise; } };
  const { LanguagePreferenceRow } = modules({ react: h.react,
    'react-i18next': { useTranslation: () => ({ t: key => key, i18n: { resolvedLanguage: 'ro', changeLanguage: async () => changed++ } }) },
    '@/core/DataProviderContext': { useDataProvider: () => ({ user, updateSessionUser() {} }) }, sonner: { toast: { error: value => errors.push(value) } },
  }).load('components/profile/LanguagePreferenceRow');
  const button = h.render(LanguagePreferenceRow); button.props.onClick(); button.props.onClick();
  assert.equal(calls, 1); assert.equal(h.render().props.disabled, true);
  request.reject(Error('offline')); await settle();
  assert.equal(h.render().props.disabled, false); assert.equal(errors.length, 1); assert.equal(changed, 0);
});

test('notifications refresh on opening and coalesce visible polling; cleanup stops listeners', async () => {
  const h = hooks(), window = new EventTarget(), document = new EventTarget(), navigator = { onLine: true };
  let tick, calls = 0, armed = false;
  const setTimeout = fn => { tick = fn; armed = true; return 1; };
  const clearTimeout = () => { armed = false; };
  document.visibilityState = 'visible';
  const refresh = async () => { calls++; };
  const { NotificationsPopover } = modules({ react: h.react,
    '@/lib/native/navigation': {}, '@/lib/navigation/useBackLayer': { useBackLayer() {} }, '@/components/ui/RequestFeedback': {},
    'framer-motion': { motion: new Proxy({}, { get: (_, type) => type }), AnimatePresence: 'presence' },
    'next/navigation': { useRouter: () => ({}) }, '@/core/DataProviderContext': { useDataProvider: () => ({ user: { properties: { id: 'user' } } }) },
    '@/core/DataProvider': { User: { useNotifications: () => ({ notifications: [], notificationsLoading: false, refresh, unreadCount: 0, markRead() {} }) } },
    '@/features/events/dateFormat': {}, 'react-i18next': { useTranslation: () => ({ t: key => key }) },
  }, { window, document, navigator, setTimeout, clearTimeout }).load('components/NotificationsPopover');
  const tree = h.render(NotificationsPopover);
  find(tree, node => node.props?.['aria-label'] === 'notifications.title').props.onClick();
  assert.equal(calls, 1);
  window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus'));
  assert.equal(calls, 2); await settle(); await tick();
  assert.equal(calls, 3);
  document.visibilityState = 'hidden'; await tick(); assert.equal(calls, 3);
  document.visibilityState = 'visible'; navigator.onLine = false; await tick(); assert.equal(calls, 3);
  navigator.onLine = true; document.dispatchEvent(new Event('visibilitychange')); assert.equal(calls, 4);
  await settle(); h.unmount(); assert.equal(armed, false);
  window.dispatchEvent(new Event('focus')); assert.equal(calls, 4);
});

test('pulled account deletion dialog requires matching email/password and disables destructive confirmation while busy', () => {
  const h = hooks(), document = { activeElement: null, body: { style: {} } }, window = new EventTarget();
  const { DeleteAccountDialog } = modules({ react: h.react,
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
  }, { document, window, HTMLElement: class {} }).load('components/profile/DeleteAccountDialog');
  let busy = false;
  const render = () => h.render(() => DeleteAccountDialog({ open: true, email: 'user@example.com', requiresPassword: true, busy, onClose() {}, onConfirm() {} }));
  let tree = render();
  const confirm = tree => find(tree, node => node.type === 'button' && node.props.className?.includes('bg-red-'));
  assert.equal(confirm(tree).props.disabled, true);
  find(tree, node => node.props?.id === 'delete-account-confirmation').props.onChange({ target: { value: ' USER@EXAMPLE.COM ' } });
  tree = render(); assert.equal(confirm(tree).props.disabled, true);
  find(tree, node => node.props?.type === 'password').props.onChange({ target: { value: 'password' } });
  tree = render(); assert.equal(confirm(tree).props.disabled, false);
  busy = true; assert.equal(confirm(render()).props.disabled, true); h.unmount();
});
