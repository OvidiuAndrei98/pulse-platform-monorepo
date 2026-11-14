// Development tunnels can append the same protocol more than once. Metro uses
// this header verbatim as a URL scheme, so "https, https" otherwise crashes
// bundle requests before a single asset can be loaded in Expo Go.
function withNormalizedProxyHeaders(middleware) {
  return (req, res, next) => {
    const forwarded = req.headers['x-forwarded-proto'];
    if (forwarded !== undefined) {
      const protocols = (Array.isArray(forwarded) ? forwarded : [forwarded])
        .flatMap(value => value.split(','))
        .map(value => value.trim().toLowerCase());
      const protocol = protocols[0];
      // Collapse only unambiguous HTTP(S) values; do not guess a protocol from
      // conflicting proxy chains or pass an invalid URL scheme through to Metro.
      if (!['http', 'https'].includes(protocol) || protocols.some(value => value !== protocol)) {
        res.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        res.end('Invalid forwarded protocol.');
        return;
      }
      req.headers['x-forwarded-proto'] = protocol;
    }
    return middleware(req, res, next);
  };
}

module.exports = { withNormalizedProxyHeaders };
