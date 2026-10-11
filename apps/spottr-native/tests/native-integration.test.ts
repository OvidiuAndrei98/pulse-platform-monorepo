import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterEvents, clusterZoom, radialPositions, project, unproject, validCoordinate, zoomForDistance } from '../src/map/geometry';
import { normalizeEvent } from '../src/data/events';
import { googleLoginUrl, readGoogleToken, GOOGLE_RETURN } from '../src/auth/google';
import { nativePath } from '../src/navigation/links';
import { parseEventSocial } from '../src/data/api';

test('map excludes missing coordinates, clusters colocated events and keeps zero coordinates', () => {
  const row = (id: number, latitude: unknown, longitude: unknown) => normalizeEvent({ id: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}`, latitude, longitude })!;
  const events = [row(1, 0, 0), row(2, 0, 0), row(3, null, 0), row(4, 91, 0), row(5, 44.4, 26.1)];
  const before = JSON.stringify(events), clusters = clusterEvents(events, 12);
  assert.deepEqual(clusters.map(c => c.events.length), [2, 1]); assert.equal(JSON.stringify(events), before);
  assert.equal(validCoordinate({ latitude: 0, longitude: 0 }), true); assert.equal(validCoordinate({ latitude: NaN, longitude: 0 }), false);
  for (const latitude of [-90, 0, 90]) assert.ok(Number.isFinite(project({ latitude, longitude: 0 }, 20).y));
  assert.ok(zoomForDistance(1) > zoomForDistance(50));
});

test('OAuth token callbacks require the exact destination and initiating nonce', () => {
  const nonce = 'a'.repeat(36), good = GOOGLE_RETURN + '#token=validated-later-by-server&clientNonce=' + nonce;
  assert.equal(readGoogleToken(good, nonce), 'validated-later-by-server');
  for (const url of [good.replace('auth/', 'attacker/'), good.replace('callback', 'callback/evil'), good.replace('spottr-native:', 'https:'), good.replace(nonce, 'b'.repeat(36)), GOOGLE_RETURN + '#token=one']) assert.throws(() => readGoogleToken(url, nonce));
  assert.throws(() => readGoogleToken(good, ''));
  const preview = 'http://localhost:8081/auth/google/callback';
  assert.equal(readGoogleToken(preview + '#token=token&clientNonce=' + nonce, nonce, preview), 'token');
  assert.throws(() => readGoogleToken('https://evil.test/#token=token&clientNonce=' + nonce, nonce, 'https://evil.test/'));
});

test('Google login keeps company values encoded and never accepts an arbitrary preview origin', () => {
  const url = new URL(googleLoginUrl('https://api.example.test/api/v1', 'a'.repeat(36), 'organizer', 'A&B SRL', ' RO123 ', 'https://evil.test'));
  assert.equal(url.searchParams.get('companyName'), 'A&B SRL'); assert.equal(url.searchParams.get('cui'), 'RO123');
  assert.equal(url.searchParams.get('client'), 'native'); assert.equal(url.searchParams.has('previewOrigin'), false);
});

test('original email, dashboard and event links preserve typed parameters', () => {
  assert.equal(nativePath('/reset-password?token=a%2Bb'), 'login?token=a%2Bb&mode=reset');
  assert.equal(nativePath('/dashboard/ticket-validation'), 'ticket-validation');
  assert.equal(nativePath('/dashboard/events/new'), 'dashboard/new');
  assert.equal(nativePath('/dashboard/events/abc'), 'dashboard/edit?eventId=abc');
  assert.equal(nativePath('/events/abc/group'), 'events/abc/group');
  assert.equal(nativePath('/scan?token=a_b'), 'scan?token=a_b');
  assert.equal(nativePath('/organizers/agreement'), 'dashboard/agreement');
  assert.equal(nativePath('/organizers/stripe-connect'), 'dashboard/stripe-info');
  assert.equal(nativePath('/dashboard/events/mobile?dashboardEventId=abc'), 'dashboard/edit?dashboardEventId=abc&eventId=abc');
  assert.equal(nativePath('/organizer/return?flow=connect&status=refresh'), 'dashboard/overview?organizerReturn=connect&returnStatus=refresh');
  assert.equal(nativePath('/organizer/return?flow=promotion&status=complete&campaignId=invalid'), 'dashboard');
});

test('overlapping map events spread into the original rings without changing their coordinates', () => {
  const events = Array.from({ length: 25 }, (_, i) => normalizeEvent({ id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`, latitude: 44.43, longitude: 26.1 })!);
  const cluster = clusterEvents(events, 18)[0]!, before = JSON.stringify(events), positions = radialPositions(cluster, 18);
  assert.equal(positions.length, 25); assert.equal(new Set(positions.map(p => JSON.stringify(p.coordinate))).size, 25);
  assert.equal(clusterZoom(cluster, 12), 18); assert.equal(JSON.stringify(events), before);
  const center = project(cluster, 18);
  for (const [i, row] of positions.entries()) {
    const p = project(row.coordinate, 18);
    assert.ok(Math.abs(Math.hypot(p.x - center.x, p.y - center.y) - (i < 8 ? 38 : i < 20 ? 68 : 102)) < .001);
    assert.ok(validCoordinate(row.coordinate));
  }
  const roundTrip = unproject(project({ latitude: 44.43, longitude: 26.1 }, 18), 18);
  assert.ok(Math.abs(roundTrip.latitude - 44.43) < .000001);
});

test('home card social preview tolerates null friends and excludes malformed attendee data', () => {
  assert.deepEqual(parseEventSocial({ friends: null }).friends, []);
  const result = parseEventSocial({ ticketsSoldCount: 5, manualGoingCount: 2, goingCount: 90, friends: [null, {}, { id: '00000000-0000-0000-0000-000000000001', username: 'Test', status: 'has_ticket' }] });
  assert.equal(result.goingCount, 7); assert.equal(result.friends.length, 1); assert.equal(result.friends[0]?.status, 'has_ticket');
});
