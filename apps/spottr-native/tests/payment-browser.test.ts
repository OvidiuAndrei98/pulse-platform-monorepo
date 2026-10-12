import assert from 'node:assert/strict';
import test from 'node:test';
import { preparePaymentBrowser, canResumePaymentBrowser, resumePaymentBrowser, forgetPaymentBrowser } from '../src/checkout/paymentBrowser.web';

function fixture() {
  const win = new EventTarget(), doc = new EventTarget();
  let focused = true, visible = true, timer: (() => void) | undefined;
  const popup = { closed: false, opener: {}, focuses: 0, focus() { this.focuses++; }, document: { title: '', body: { style: {} } }, location: { href: 'about:blank', replace(url: string) { this.href = url; } }, close() { this.closed = true; } };
  Object.assign(win, { open: () => popup, location: { origin: 'http://localhost:8082' } });
  Object.assign(doc, { hasFocus: () => focused });
  Object.defineProperty(doc, 'visibilityState', { get: () => visible ? 'visible' : 'hidden' });
  const saved = { window: globalThis.window, document: globalThis.document, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  Object.assign(globalThis, { window: win, document: doc, setInterval: (f: () => void) => { timer = f; return 1; }, clearInterval: () => { timer = undefined; } });
  return { popup, tick: () => timer?.(), left: () => { focused = false; win.dispatchEvent(new Event('blur')); }, focus: () => { focused = true; win.dispatchEvent(new Event('focus')); }, visibility: (v: boolean) => { visible = v; doc.dispatchEvent(new Event('visibilitychange')); }, restore: () => Object.assign(globalThis, saved), timer: () => timer };
}
const expected = { eventId: 'event', sessionId: 'cs_test_order' };

test('resume focuses or reopens only the original provider session for the same account', async () => {
  const f = fixture();
  try {
    const url = 'https://checkout.stripe.com/c/pay/cs_test_order';
    const browser = preparePaymentBrowser('owner-A');
    const completion = browser.open(url, expected); f.left(); f.focus(); await completion; browser.dispose();
    assert.equal(canResumePaymentBrowser('event', expected.sessionId, 'owner-A'), true);
    assert.equal(resumePaymentBrowser('event', expected.sessionId, 'owner-B'), false);
    assert.equal(resumePaymentBrowser('event', 'cs_other', 'owner-A'), false);
    assert.equal(resumePaymentBrowser('other', expected.sessionId, 'owner-A'), false);
    assert.equal(resumePaymentBrowser('event', expected.sessionId, 'owner-A'), true);
    assert.equal(f.popup.focuses, 1); assert.equal(f.popup.location.href, url);
    f.popup.close(); f.popup.location.href = 'about:blank';
    assert.equal(resumePaymentBrowser('event', expected.sessionId, 'owner-A'), true);
    assert.equal(f.popup.location.href, url, 'Reopening uses the exact same session URL, never a purchase request');
    forgetPaymentBrowser('event', expected.sessionId, 'owner-A');
    assert.equal(canResumePaymentBrowser('event', expected.sessionId, 'owner-A'), false);
  } finally { f.restore(); }
});
for (const mode of ['focus', 'visibility', 'close', 'callback'] as const) test(`web checkout resumes on ${mode}, independent of whether the Stripe tab closes`, async () => {
  const f = fixture();
  try {
    const browser = preparePaymentBrowser(); let returned = false;
    const result = browser.open('https://checkout.stripe.com/c/pay/cs_test_order', expected).then(() => { returned = true; });
    f.focus(); await Promise.resolve(); assert.equal(returned, false, 'Spurious focus must not interrupt a new checkout');
    if (mode === 'focus') { f.left(); f.focus(); }
    if (mode === 'visibility') { f.visibility(false); f.visibility(true); }
    if (mode === 'close') { f.popup.close(); f.tick(); }
    if (mode === 'callback') { f.popup.location.href = 'http://localhost:8082/checkout/return?eventId=event&sessionId=cs_test_order'; f.tick(); }
    await result; browser.dispose();
    assert.equal(returned, true);
    assert.equal(f.timer(), undefined);
    assert.equal(f.popup.closed, mode === 'close' || mode === 'callback', 'Returning early must leave Stripe available to finish payment');
  } finally { f.restore(); }
});
test('web checkout handles returning during preparation and cleans up failed preparation', async () => {
  const f = fixture();
  try {
    const browser = preparePaymentBrowser(); f.left(); f.focus();
    await browser.open('https://checkout.stripe.com/c/pay/cs_test_order', expected);
    browser.dispose(); assert.equal(f.timer(), undefined);
    f.popup.closed = false;
    const failed = preparePaymentBrowser(); failed.dispose(); assert.equal(f.popup.closed, true);
  } finally { f.restore(); }
});
test('another session or foreign callback cannot finish the active popup', async () => {
  const f = fixture();
  try {
    const browser = preparePaymentBrowser(); let returned = false;
    const result = browser.open('https://checkout.stripe.com/c/pay/cs_test_order', expected).then(() => { returned = true; });
    for (const url of ['https://foreign.test/checkout/return?eventId=event&sessionId=cs_test_order', 'http://localhost:8082/checkout/return?eventId=event&sessionId=cs_test_other']) {
      f.popup.location.href = url; f.tick(); await Promise.resolve(); assert.equal(returned, false);
    }
    browser.dispose(); await result; assert.equal(f.timer(), undefined);
  } finally { f.restore(); }
});
