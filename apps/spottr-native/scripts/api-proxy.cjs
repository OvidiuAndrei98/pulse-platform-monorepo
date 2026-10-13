const http = require('node:http');
const https = require('node:https');

// Preview-only, fixed upstream and explicit endpoint/method allowlist.
// Bearer credentials belong to the API; browser cookies and Origin never do.
function createApiProxy(apiUrl, { timeoutMs = 15000 } = {}) {
  const base = new URL(apiUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('EXPO_PUBLIC_API_URL must be an HTTP(S) API base URL without credentials, query or hash.');
  }
  const prefix = '/api/v1';
  const basePath = base.pathname.replace(/\/+$/, '');
  const transport = base.protocol === 'https:' ? https : http;
  const publicPath = /^\/(?:events(?:\/[0-9a-f-]{36}(?:\/(?:social|updates))?)?|profiles(?:\/(?:search|[0-9a-f-]{36}))?|organizers\/[0-9a-f-]{36}\/updates|promotions\/active)$/i;
  const routes = [
    [/^\/media\/events\/[0-9a-f-]{36}\/[0-9a-f]+\.(?:jpe?g|png|webp)$/i, ['GET']],
    [/^\/events\/[0-9a-f-]{36}\/attendees$/i, ['GET']],
    [/^\/events\/[0-9a-f-]{36}\/safety-group$/i, ['GET', 'POST']],
    [/^\/events\/[0-9a-f-]{36}\/safety-group\/(?:respond|invite|messages|help|help-resolved)$/i, ['POST']],
    [/^\/promotions\/[0-9a-f-]{36}\/track$/i, ['POST']],
    [/^\/spotify\/search$/, ['GET']],
    [/^\/dashboard\/places\/(?:autocomplete|details)$/, ['GET']],
    [/^\/dashboard\/events$/, ['GET', 'POST']],
    [/^\/dashboard\/events\/[0-9a-f-]{36}$/i, ['GET', 'POST', 'DELETE']],
    [/^\/dashboard\/organizer\/profile\/[0-9a-f-]{36}$/i, ['GET']],
    [/^\/dashboard\/organizer\/(?:profile|agreement)$/, ['POST']],
    [/^\/dashboard\/stripe\/status$/, ['GET']],
    [/^\/dashboard\/stripe\/(?:account-link|login-link)$/, ['POST']],
    [/^\/dashboard\/stripe\/account$/, ['DELETE']],
    [/^\/dashboard\/finance(?:\/(?:refunds-attention|invoices))?$/, ['GET']],
    [/^\/dashboard\/finance\/refunds-attention\/[0-9a-f-]{36}\/reconcile$/i, ['POST']],
    [/^\/dashboard\/invoicing\/settings$/, ['GET', 'PUT', 'DELETE']],
    [/^\/dashboard\/invoicing\/options$/, ['POST']],
    [/^\/dashboard\/invoicing\/invoices$/, ['GET']],
    [/^\/dashboard\/invoicing\/invoices\/[0-9a-f-]{36}\/retry$/i, ['POST']],
    [/^\/dashboard\/promotions(?:\/(?:plans|availability))?$/, ['GET']],
    [/^\/dashboard\/promotions\/checkout$/, ['POST']],
    [/^\/dashboard\/promotions\/[0-9a-f-]{36}\/reconcile$/i, ['POST']],
    [/^\/dashboard\/events\/[0-9a-f-]{36}\/(?:invitations|promo-codes|cancellation-request)$/i, ['GET', 'POST']],
    [/^\/dashboard\/events\/[0-9a-f-]{36}\/updates$/i, ['POST']],
    [/^\/dashboard\/events\/[0-9a-f-]{36}\/(?:promo-codes|updates)\/[0-9a-f-]{36}$/i, ['DELETE']],
    [/^\/dashboard\/events\/[0-9a-f-]{36}\/invitations\/[0-9a-f-]{36}(?:\/permanent)?$/i, ['DELETE']],
    [/^\/dashboard\/uploads\/(?:event-banner|organizer-update)$/, ['POST']],
    [/^\/dashboard\/ticket-validation\/events$/, ['GET']],
    [/^\/dashboard\/ticket-validation\/events\/[0-9a-f-]{36}\/my-scans$/i, ['GET']],
    [/^\/dashboard\/ticket-validation\/events\/[0-9a-f-]{36}\/(?:offline-snapshot|offline-sync|tickets\/validate)$/i, ['POST']],
    [/^\/dashboard\/ticket-validation\/events\/[0-9a-f-]{36}\/(?:staff|quick-access)$/i, ['GET', 'POST']],
    [/^\/dashboard\/ticket-validation\/events\/[0-9a-f-]{36}\/(?:staff|quick-access)\/[0-9a-f-]{36}$/i, ['DELETE']],
    [/^\/ticket-validation\/quick-access\/(?:session|validate)$/, ['POST']],
    [/^\/admin\/(?:organizers|event-cancellations|refunds-attention|promotion-invoices-attention|client-errors)$/, ['GET']],
    [/^\/diagnostics\/errors$/, ['POST']],
    [/^\/admin\/organizers\/[0-9a-f-]{36}\/verification$/i, ['PATCH']],
    [/^\/admin\/event-cancellations\/[0-9a-f-]{36}\/(?:approve|reject|retry)$/i, ['POST']],
    [/^\/admin\/refunds-attention\/[0-9a-f-]{36}\/reconcile$/i, ['POST']],
    [/^\/organizers\/[0-9a-f-]{36}\/follow$/i, ['POST', 'DELETE']],
    [/^\/auth\/(login|register|forgot-password|reset-password)$/, ['POST']],
    [/^\/users\/me$/, ['GET', 'PUT', 'DELETE']],
    [/^\/users\/me\/(saved-events|tickets|orders)$/, ['GET']],
    [/^\/users\/me\/billing-details$/, ['GET', 'PUT', 'DELETE']],
    [/^\/events\/[0-9a-f-]{36}\/(?:tickets\/(?:purchase|book)|promo-code\/validate)$/i, ['POST']],
    [/^\/events\/[0-9a-f-]{36}\/rsvp$/i, ['PUT', 'DELETE']],
    [/^\/checkout\/reconcile$/, ['POST']],
    [/^\/users\/me\/avatar$/, ['POST']],
    [/^\/users\/me\/hidden-categories$/, ['GET', 'POST']],
    [/^\/users\/me\/hidden-categories\/[^/]+$/, ['DELETE']],
    [/^\/events\/[0-9a-f-]{36}\/favorite$/i, ['POST', 'DELETE']],
    [/^\/friends(?:\/requests)?$/, ['GET']],
    [/^\/feed$/, ['GET']],
    [/^\/friends\/request\/[0-9a-f-]{36}$/i, ['POST', 'PUT']],
    [/^\/friends\/(?:connect|request)\/[0-9a-f-]{36}$/i, ['POST']],
    [/^\/friends\/[0-9a-f-]{36}$/i, ['DELETE']],
    [/^\/notifications$/, ['GET']],
    [/^\/notifications\/(?:read-all|[0-9a-f-]{36}\/read)$/i, ['POST']],
  ];

  return (req, res, next) => {
    const path = req.url || '';
    if (path !== prefix && !path.startsWith(prefix + '/') && !path.startsWith(prefix + '?')) return next();
    const fail = (status, error) => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      // Rejected uploads may still have an unread body. Do not reuse that
      // connection for the next request (which would wait behind that body).
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Connection: 'close' });
      res.end(JSON.stringify({ error }));
    };
    if (req.headers['sec-fetch-site'] === 'cross-site') { fail(403, 'Cross-site proxy access is not allowed.'); return; }
    if (req.headers.origin) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host) { fail(403, 'Cross-origin proxy access is not allowed.'); return; }
      } catch { fail(403, 'Invalid origin.'); return; }
    }
    let target;
    try {
      target = new URL(base.origin + basePath + path.slice(prefix.length));
      if (target.origin !== base.origin || (target.pathname !== basePath && !target.pathname.startsWith(basePath + '/'))) throw new Error();
    } catch { fail(400, 'Invalid API path.'); return; }
    // A GET is not necessarily read-only (e.g. account activation callbacks).
    const endpoint = target.pathname.slice(basePath.length);
    const allowed = publicPath.test(endpoint) ? ['GET', 'HEAD'] : routes.find(([pattern]) => pattern.test(endpoint))?.[1];
    if (!allowed) { fail(403, 'This endpoint is not available in the preview proxy.'); return; }
    if (!allowed.includes(req.method)) { fail(405, 'Method not allowed for this preview endpoint.'); return; }
    const headers = { Accept: endpoint.startsWith('/media/events/') ? 'image/*' : 'application/json' };
    if (/^Bearer [^\s]+$/.test(req.headers.authorization || '')) headers.Authorization = req.headers.authorization;
    if (/^[0-9a-f-]{36}$/i.test(req.headers['idempotency-key'] || '')) headers['Idempotency-Key'] = req.headers['idempotency-key'];
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    const limit = endpoint === '/users/me/avatar' || /^\/dashboard\/uploads\/(?:event-banner|organizer-update)$/.test(endpoint) ? 2 * 1024 * 1024 : 64 * 1024;
    if (Number(req.headers['content-length']) > limit) { fail(413, 'Request body is too large.'); return; }

    const upstream = transport.request(target, { method: req.method, headers }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.resume(); fail(502, 'Unexpected API redirect.'); return;
      }
      const headers = { 'Cache-Control': 'no-store' };
      for (const key of ['content-type', 'content-encoding', 'content-length', 'retry-after']) {
        if (response.headers[key] !== undefined) headers[key] = response.headers[key];
      }
      res.writeHead(response.statusCode || 502, headers);
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    const timer = setTimeout(() => { fail(504, 'API request timed out.'); upstream.destroy(); }, timeoutMs);
    upstream.on('error', () => fail(502, 'API is unavailable.'));
    res.once('close', () => { clearTimeout(timer); upstream.destroy(); });
    let received = 0;
    req.on('data', chunk => {
      received += chunk.length;
      if (received > limit) { fail(413, 'Request body is too large.'); upstream.destroy(); return; }
      if (!upstream.write(chunk)) req.pause();
    });
    upstream.on('drain', () => req.resume());
    req.on('end', () => upstream.end());
    req.on('aborted', () => upstream.destroy());
    req.on('error', () => upstream.destroy());
  };
}

module.exports = { createApiProxy };
