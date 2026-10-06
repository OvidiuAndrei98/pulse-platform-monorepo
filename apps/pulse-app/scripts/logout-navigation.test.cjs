const assert = require('node:assert/strict');
const { test } = require('node:test');
const { hooks, modules, settle } = require('./helpers/qaHarness.cjs');

test('login close replaces protected/auth history with Home and preserves Back to public pages', () => {
  for (const previous of [undefined, '/dashboard', '/dashboard/profile', '/admin', '/ticket-validation', '/users/me', '/login', '/register', '/events/mobile/group', '/', '/events?eventId=123', '/events/123', '/users/organizer', '/feed']) {
    const calls = [];
    const window = { history: { state: { __spottrNavigation: { previous } } } };
    const m = modules({ 'next/link': { default: 'link' }, 'next/navigation': { useRouter: () => ({ back: () => calls.push('back'), replace: path => calls.push(path) }) },
      '@/lib/native/navigation': { routeForPlatform: path => path },
    }, { window });
    const { isPublicLoginReturnPath } = m.load('lib/navigation/loginReturn');
    const link = m.load('components/BackLink').BackLink({ href: '/', canReturnTo: isPublicLoginReturnPath });
    link.props.onClick({ button: 0, preventDefault() {} });
    const publicPage = ['/', '/events?eventId=123', '/events/123', '/users/organizer', '/feed'].includes(previous);
    assert.equal(calls.join(','), publicPage ? 'back' : '/', String(previous));
  }
});

test('login return policy rejects external, malformed and normalized protected paths', () => {
  const { isPublicLoginReturnPath } = modules().load('lib/navigation/loginReturn');
  for (const path of ['//evil.test', 'https://evil.test', '/\\evil.test', '/events/../dashboard', '/events/%2e%2e/users/me', '/users/me/tickets']) {
    assert.equal(isPublicLoginReturnPath(path), false, path);
  }
});

test('protected logout redirects once using replace, never pushes a dashboard/login loop', async () => {
  for (const path of ['/dashboard', '/dashboard/profile', '/admin', '/ticket-validation']) {
    const h = hooks(), calls = [], window = new EventTarget();
    let token = 'token';
    const router = { push: href => calls.push(['push', href]), replace: href => calls.push(['replace', href]) };
    const i18n = { changeLanguage: async () => {} };
    const { DataProvider } = modules({ react: h.react,
      'next/navigation': { usePathname: () => path, useRouter: () => router },
      'react-i18next': { useTranslation: () => ({ t: key => key, i18n }) },
      './DataProvider': { User: class { constructor(properties) { this.properties = properties; } }, clearSessionCaches() {} },
      '@/lib/native/apiFetch': { apiFetch() {} },
      './apiRoot': { apiRoot: 'https://test' }, '@/components/ui/loading': { PageLoadingState: 'loading' },
      '@/lib/native/sessionStorage': { getAccessTokenSync: () => token, hydrateAccessToken: async () => token,
        saveOfflineSession: async () => {}, clearAccessToken: async () => { token = null; }, clearOfflineSession: async () => {} },
      '@packages/api-client/src/Client': { ApiError: class extends Error {}, ApiClient: { configure() {}, instance: { get: async () => ({ id: 'organizer', role: 'organizer' }) } } },
    }, { window }).load('core/DataProviderContext');
    const render = () => h.render(() => DataProvider({ children: null }));
    render(); await settle();
    render().props.value.logout(); render(); await settle();
    assert.equal(token, null);
    assert.deepEqual(calls, [['replace', '/login']], path);
    h.unmount();
  }
});
