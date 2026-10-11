import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTicketPdfHtml } from '../../pulse-app/src/components/tickets/ticketPdfHtml';
import { formatTicketDate, type PrintableTicket } from '../../pulse-app/src/components/tickets/ticketDesign';

const qr = 'data:image/png;base64,iVBORw0KGgo=';
const copy = (key: string) => key;
const ticket: PrintableTicket = {
  id: '12345678-abcd-abcd-abcd-123456789012', eventTitle: 'Concert București',
  ticketTypeName: 'General admission', validationHash: 'private-validation-secret',
  startTime: '2026-10-07T18:30:00Z', locationName: 'Sala Palatului',
  ticketPriceBani: 12500, ticketingFeeBani: 250, paidTotalBani: 12750, vatAmountBani: 238, vatPercentage: 21,
};

test('the A4 document retains ticket identity, local QR image, payment details and one page wrapper', () => {
  const html = renderTicketPdfHtml(ticket, qr, copy, 'en');
  assert.equal((html.match(/data-ticket-pdf="true"/g) ?? []).length, 1);
  assert.match(html, /width: 794px; height: 1123px/);
  assert.match(html, /<h1>Concert București<\/h1>/);
  assert.match(html, /<img src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.equal((html.match(new RegExp(ticket.id, 'g')) ?? []).length, 2);
  assert.equal(html.includes(ticket.validationHash), false, 'the validation secret belongs only in the generated QR');
  assert.match(html, /07\.10\.2026 · 21:30/);
  assert.match(html, /ticketPdf\.includedVat \(21%\)/);
  assert.match(html, /<footer class="footer">spottr\.ro<\/footer>/);
});

test('untrusted ticket strings and translations cannot create HTML elements or attributes', () => {
  const hostile = '<img src=x onerror="steal()"> & \' {{qr}}';
  const value = { ...ticket, id: hostile, eventTitle: hostile, ticketTypeName: hostile, locationName: hostile };
  const html = renderTicketPdfHtml(value, qr, () => hostile, 'en" onload="steal()');
  assert.equal((html.match(/<img /g) ?? []).length, 1, 'only the locally generated QR image is an element');
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('onload="steal()'), false);
  assert.match(html, /&lt;img src=x onerror=&quot;steal\(\)&quot;&gt; &amp; &#39; \{\{qr\}\}/);
  assert.match(html, /<html lang="en&quot; onload=&quot;steal\(\)">/);
});

test('remote URLs, SVG data, malformed data and attribute injection are rejected as QR sources', () => {
  for (const value of ['', 'https://example.test/tracker.png', 'file:///private/key', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,', 'data:image/png;base64,AAAA" onload="steal()', 'data:image/png;base64,AAAA\n']) {
    assert.throws(() => renderTicketPdfHtml(ticket, value, copy, 'en'), /INVALID_TICKET_QR_IMAGE/);
  }
});

test('Romanian and English formatting preserve bani precision and zero prices', () => {
  for (const [language, locale] of [['ro', 'ro-RO'], ['en', 'en-GB']] as const) {
    const html = renderTicketPdfHtml({ ...ticket, ticketPriceBani: 0, ticketingFeeBani: 1, paidTotalBani: 1, vatAmountBani: 0 }, qr, copy, language);
    const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'RON' }).format(value);
    assert.ok(html.includes(money(0)));
    assert.ok(html.includes(money(0.01)));
    assert.match(html, /<tr class="vat">/);
    assert.equal(html.includes('NaN'), false);
  }
});

test('legacy RON values and absent price fields render their established fallbacks', () => {
  const base: PrintableTicket = { id: ticket.id, eventTitle: ticket.eventTitle, ticketTypeName: ticket.ticketTypeName, validationHash: ticket.validationHash, startTime: ticket.startTime, locationName: ticket.locationName };
  const legacy = renderTicketPdfHtml({ ...base, priceRon: 12.5 }, qr, copy, 'en');
  assert.match(legacy, /12\.50 RON/);
  assert.equal(legacy.includes('<tr class="vat">'), false);
  const missing = renderTicketPdfHtml(base, qr, copy, 'en');
  assert.equal((missing.match(/<td>—<\/td>/g) ?? []).length, 3);
  assert.equal(missing.includes('undefined'), false);
});

test('ticket dates use Bucharest time in both winter and summer and handle invalid dates', () => {
  assert.equal(formatTicketDate('2026-01-07T18:30:00Z', 'unknown'), '07.01.2026 · 20:30');
  assert.equal(formatTicketDate('2026-07-07T18:30:00Z', 'unknown'), '07.07.2026 · 21:30');
  const html = renderTicketPdfHtml({ ...ticket, startTime: 'invalid' }, qr, key => key === 'date.unknown' ? '<unknown date>' : key, 'ro');
  assert.match(html, /&lt;unknown date&gt;/);
  assert.equal(html.includes('Invalid Date'), false);
});
