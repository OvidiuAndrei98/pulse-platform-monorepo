import assert from "node:assert/strict";
import test from "node:test";
import {
  WardrobeStore,
  readProfileQR,
  pickupActive,
  fitsZone,
  depositedSince,
  type Deposit,
  type Overview,
  type Request,
  type Zone,
} from "../../pulse-app/src/features/wardrobe/model";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const zone: Zone = {
  id: id(2),
  name: "A",
  prefix: "A",
  kind: "any",
  capacity: 100,
  enabled: true,
  revision: 1,
  occupied: 0,
};
const receipt: Deposit = {
  id: id(3),
  eventId: id(1),
  eventTitle: "Night",
  userId: id(4),
  customerName: "Guest",
  zoneId: zone.id,
  zoneName: "A",
  number: "A001",
  status: "reserved",
  items: { coat: 1, bag: 0, backpack: 0 },
  remaining: { coat: 1, bag: 0, backpack: 0 },
  revision: 1,
  reservedUntil: new Date(Date.now() + 300000).toISOString(),
  createdAt: new Date().toISOString(),
  storedAt: null,
  returnedAt: null,
  pickupId: null,
  pickupItems: null,
  pickupExpiresAt: null,
  pickupApproved: false,
};
const overview = (eventId = id(1)): Overview => ({
  eventId,
  title: "Night",
  canManage: true,
  canRecover: true,
  accepting: true,
  eventEnded: false,
  unclaimedCount: 0,
  unclaimedItems: 0,
  zones: [zone],
  staff: [],
  deposits: [],
  nextCursor: "",
  audit: [],
});
const fallback = (path: string) =>
  path === "/wardrobe/mine"
    ? { deposits: [], staffAccess: true }
    : path === "/wardrobe/events"
      ? [{ id: id(1), title: "Night", canManage: true }]
      : path.includes("/deposits/")
        ? { deposit: receipt }
        : overview();
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test("elapsed storage time uses check-in time and handles boundaries", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");
  assert.equal(
    depositedSince(
      { storedAt: "2026-10-17T11:00:00Z", createdAt: "2026-10-16T00:00:00Z" },
      true,
      now,
    ),
    "Depozitat de 2 zile",
  );
  assert.equal(
    depositedSince(
      { storedAt: null, createdAt: "2026-10-19T11:00:00Z" },
      false,
      now,
    ),
    "Checked in 1 hour ago",
  );
  assert.equal(
    depositedSince(
      { storedAt: "2026-10-19T12:01:00Z", createdAt: "" },
      true,
      now,
    ),
    "Depozitat acum",
  );
  assert.equal(
    depositedSince({ storedAt: null, createdAt: "invalid" }, true, now),
    "",
  );
});

test("unclaimed filter survives search, pagination and refresh and can be cleared", async () => {
  const paths: string[] = [];
  const store = new WardrobeStore((async (path) => {
    paths.push(path);
    return fallback(path);
  }) as Request);
  await store.refresh(true);
  await store.change({ unclaimed: true, history: false });
  await store.change({ search: "A001" });
  await store.change({ cursor: id(5) });
  await store.refresh(true);
  const requests = paths.filter((path) =>
    path.includes("/wardrobe/events/" + id(1) + "?"),
  );
  assert.ok(
    requests
      .slice(1)
      .every(
        (path) =>
          path.includes("unclaimed=true") && path.includes("history=false"),
      ),
  );
  assert.ok(
    requests.some(
      (path) => path.includes("q=A001") && path.includes("before=" + id(5)),
    ),
  );
  await store.change({ unclaimed: false, history: true });
  assert.equal(store.snapshot().unclaimed, false);
  assert.equal(store.snapshot().cursor, "");
  assert.match(paths.at(-1)!, /history=true&unclaimed=false/);
});

test("profile codes identify an account without accepting ticket or URL payloads", () => {
  assert.equal(readProfileQR("glow://friend/" + id(4)), id(4));
  assert.equal(readProfileQR("pulse://friend/" + id(4)), id(4));
  for (const value of [
    "https://x/" + id(4),
    id(4),
    "glow://friend/" + id(4) + "?admin=true",
    "ticket:" + id(4),
  ])
    assert.equal(readProfileQR(value), null);
  assert.equal(
    fitsZone({ coat: 1, bag: 1, backpack: 0 }, { ...zone, kind: "coat" }),
    false,
  );
  assert.equal(fitsZone(receipt.items, { ...zone, enabled: false }), false);
  assert.equal(
    pickupActive(
      {
        ...receipt,
        status: "stored",
        pickupId: id(5),
        pickupExpiresAt: new Date(1000).toISOString(),
      },
      1001,
    ),
    false,
  );
});
test("lost reservation response retries the same request key and preserves the error", async () => {
  let failed = true,
    n = 20;
  const writes: any[] = [];
  const request = (async (path, options) => {
    if (options?.method === "POST") {
      writes.push(options.body);
      if (failed) throw new Error("network unavailable");
      return { deposit: receipt };
    }
    return fallback(path);
  }) as Request;
  const store = new WardrobeStore(request);
  await store.refresh(true);
  assert.equal(
    await store.reserve(
      "glow://friend/" + id(4),
      zone.id,
      receipt.items,
      false,
      () => id(n++),
    ),
    null,
  );
  assert.ok(store.snapshot().error);
  failed = false;
  await store.reserve(
    "glow://friend/" + id(4),
    zone.id,
    receipt.items,
    false,
    () => id(n++),
  );
  assert.equal(writes.length, 2);
  assert.equal(writes[0].requestId, writes[1].requestId);
  assert.equal(store.snapshot().selected?.number, "A001");
  await store.reserve(
    "glow://friend/" + id(4),
    zone.id,
    receipt.items,
    true,
    () => id(n++),
  );
  assert.notEqual(writes[2].requestId, writes[1].requestId);
  assert.equal(writes[2].additional, true);
});
test("rapid taps cannot submit two custody commands", async () => {
  const pending = deferred<any>();
  let posts = 0;
  const store = new WardrobeStore((async (path, options) => {
    if (options?.method === "POST") {
      posts++;
      return pending.promise;
    }
    return fallback(path);
  }) as Request);
  await store.refresh(true);
  const first = store.command({
    action: "store",
    depositId: receipt.id,
    revision: 1,
  });
  await store.command({ action: "store", depositId: receipt.id, revision: 1 });
  assert.equal(posts, 1);
  pending.resolve({ deposit: receipt });
  await first;
  assert.equal(store.snapshot().busy, false);
});
test("switching event discards a late previous event response", async () => {
  const pending = deferred<any>();
  let delay = false;
  const store = new WardrobeStore((async (path) => {
    if (path.startsWith("/wardrobe/events/" + id(1) + "?") && delay)
      return pending.promise;
    return path.startsWith("/wardrobe/events/" + id(8) + "?")
      ? overview(id(8))
      : fallback(path);
  }) as Request);
  await store.refresh(true);
  delay = true;
  const old = store.refresh(true);
  await new Promise((r) => setImmediate(r));
  await store.change({ eventId: id(8) });
  pending.resolve(overview());
  await old;
  assert.equal(store.snapshot().eventId, id(8));
  assert.equal(store.snapshot().overview?.eventId, id(8));
});
test("account teardown aborts requests and prevents late publication", async () => {
  const pending = deferred<any>();
  let signal: AbortSignal | undefined;
  const store = new WardrobeStore((async (_path, options) => {
    signal = options?.signal;
    return pending.promise;
  }) as Request);
  const reading = store.refresh();
  store.dispose();
  assert.equal(signal?.aborted, true);
  pending.resolve({ deposits: [receipt], staffAccess: false });
  await reading;
  assert.equal(store.snapshot().mine, undefined);
});
test("revoked staff access clears previously displayed customer data", async () => {
  let revoked = false;
  const store = new WardrobeStore((async (path) => {
    if (revoked && path.startsWith("/wardrobe/events/"))
      throw new Error("WARDROBE_ACCESS_DENIED");
    return fallback(path);
  }) as Request);
  await store.refresh(true);
  store.select(receipt);
  revoked = true;
  await store.refresh(true);
  assert.equal(store.snapshot().overview, undefined);
  assert.equal(store.snapshot().selected, undefined);
  assert.ok(store.snapshot().error);
});
test("customer approval includes the exact live pickup id, never a staff return command", async () => {
  const writes: any[] = [];
  const store = new WardrobeStore((async (path, options) => {
    if (options?.method === "POST") {
      writes.push([path, options.body]);
      return { ok: true };
    }
    return fallback(path);
  }) as Request);
  await store.approve({ ...receipt, status: "stored", pickupId: id(9) }, true);
  assert.deepEqual(writes, [
    [
      `/wardrobe/mine/${receipt.id}/confirm`,
      { pickupId: id(9), approve: true },
    ],
  ]);
});

test("retention removes an expired selection without blocking fresh history", async () => {
  let removed = false;
  let selectedReads = 0;
  const refreshed = { ...overview(), title: "Refreshed history" };
  const store = new WardrobeStore((async (path) => {
    if (path.includes("/deposits/")) {
      selectedReads++;
      if (removed) throw new Error("WARDROBE_NOT_FOUND");
    }
    if (removed && path.startsWith(`/wardrobe/events/${id(1)}?`))
      return refreshed;
    return fallback(path);
  }) as Request);
  await store.refresh(true);
  store.select({ ...receipt, status: "returned" });
  removed = true;
  await store.refresh(true);
  assert.equal(store.snapshot().selected, undefined);
  assert.equal(store.snapshot().overview, refreshed);
  assert.equal(store.snapshot().error, null);
  await store.refresh(true);
  assert.equal(selectedReads, 1);
});

test("a deleted pagination anchor returns to the first page with the same filters", async () => {
  let removed = false;
  const paths: string[] = [];
  const freshReceipt = { ...receipt, id: id(17), status: "returned" as const };
  const fresh = { ...overview(), deposits: [freshReceipt] };
  const store = new WardrobeStore((async (path) => {
    if (path.startsWith(`/wardrobe/events/${id(1)}?`)) {
      paths.push(path);
      if (path.includes(`before=${id(12)}`))
        return { ...overview(), deposits: removed ? [] : [receipt] };
      if (removed) return fresh;
    }
    return fallback(path);
  }) as Request);
  await store.refresh(true);
  await store.change({ history: true, search: "Guest name", cursor: id(12) });
  assert.equal(store.snapshot().cursor, id(12));
  removed = true;
  paths.length = 0;
  await store.refresh(true);
  assert.deepEqual(paths, [
    `/wardrobe/events/${id(1)}?q=Guest%20name&history=true&unclaimed=false&before=${id(12)}`,
    `/wardrobe/events/${id(1)}?q=Guest%20name&history=true&unclaimed=false&before=`,
  ]);
  assert.equal(store.snapshot().cursor, "");
  assert.equal(store.snapshot().history, true);
  assert.equal(store.snapshot().search, "Guest name");
  assert.equal(store.snapshot().overview, fresh);
  assert.equal(store.snapshot().error, null);
});

test("selection refresh keeps network and unexpected 404 errors visible", async () => {
  for (const failure of [
    new Error("Network unavailable"),
    Object.assign(new Error("HTTP_ERROR"), { status: 404, code: "HTTP_ERROR" }),
  ]) {
    let failing = false;
    const store = new WardrobeStore((async (path) => {
      if (failing && path.includes("/deposits/")) throw failure;
      return fallback(path);
    }) as Request);
    await store.refresh(true);
    store.select(receipt);
    const previous = store.snapshot().overview;
    failing = true;
    await store.refresh(true);
    assert.equal(store.snapshot().selected, receipt);
    assert.equal(store.snapshot().overview, previous);
    assert.equal(store.snapshot().error, failure);
  }
});

test("access revoked while refreshing a selection still clears private data", async () => {
  let revoked = false;
  const failure = Object.assign(new Error("WARDROBE_ACCESS_DENIED"), {
    status: 403,
    code: "WARDROBE_ACCESS_DENIED",
  });
  const store = new WardrobeStore((async (path) => {
    if (revoked && path.includes("/deposits/")) throw failure;
    return fallback(path);
  }) as Request);
  await store.refresh(true);
  store.select(receipt);
  revoked = true;
  await store.refresh(true);
  assert.equal(store.snapshot().selected, undefined);
  assert.equal(store.snapshot().overview, undefined);
  assert.equal(store.snapshot().mine, undefined);
  assert.equal(store.snapshot().error, failure);
});

test("a delayed cursor recovery cannot overwrite another event", async () => {
  const pending = deferred<Overview>();
  let recovering = false;
  const store = new WardrobeStore((async (path) => {
    if (path.startsWith(`/wardrobe/events/${id(1)}?`)) {
      if (path.includes(`before=${id(12)}`))
        return { ...overview(), deposits: recovering ? [] : [receipt] };
      if (recovering) return pending.promise;
    }
    if (path.startsWith(`/wardrobe/events/${id(8)}?`)) return overview(id(8));
    return fallback(path);
  }) as Request);
  await store.refresh(true);
  await store.change({ cursor: id(12), history: true });
  recovering = true;
  const previousRefresh = store.refresh(true);
  await new Promise((resolve) => setImmediate(resolve));
  await store.change({ eventId: id(8), history: false });
  pending.resolve({ ...overview(), deposits: [receipt] });
  await previousRefresh;
  assert.equal(store.snapshot().eventId, id(8));
  assert.equal(store.snapshot().overview?.eventId, id(8));
  assert.equal(store.snapshot().history, false);
  assert.equal(store.snapshot().cursor, "");
});

test("changing the event clears its hidden search while preserving the unclaimed view", async () => {
  const paths: string[] = [];
  const store = new WardrobeStore((async (path) => {
    const event = /^\/wardrobe\/events\/([^/?]+)\?/.exec(path)?.[1];
    if (event) {
      paths.push(path);
      return { ...overview(event), deposits: [{ ...receipt, eventId: event }] };
    }
    return fallback(path);
  }) as Request);
  await store.refresh(true);
  await store.change({ search: "Franco", unclaimed: true, history: false });
  await store.change({ cursor: id(12) });
  assert.equal(store.snapshot().search, "Franco");
  assert.equal(store.snapshot().cursor, id(12));
  assert.equal(store.snapshot().unclaimed, true);

  // Re-selecting the same event is not an event switch.
  await store.change({ eventId: id(1) });
  assert.equal(store.snapshot().search, "Franco");

  await store.change({ eventId: id(8) });
  assert.equal(store.snapshot().search, "");
  assert.equal(store.snapshot().cursor, "");
  assert.equal(store.snapshot().unclaimed, true);
  assert.equal(store.snapshot().history, false);
  assert.equal(
    paths.at(-1),
    `/wardrobe/events/${id(8)}?q=&history=false&unclaimed=true&before=`,
  );

  // A caller can intentionally open another event with an explicit filter.
  await store.change({ eventId: id(1), search: "Other guest" });
  assert.equal(store.snapshot().search, "Other guest");
  assert.equal(
    paths.at(-1),
    `/wardrobe/events/${id(1)}?q=Other%20guest&history=false&unclaimed=true&before=`,
  );

  await store.change({ unclaimed: false, history: true, search: "" });
  assert.equal(
    paths.at(-1),
    `/wardrobe/events/${id(1)}?q=&history=true&unclaimed=false&before=`,
  );
});
