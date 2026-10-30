import assert from "node:assert/strict";
import test from "node:test";
import {
  WardrobeStore,
  wardrobeError,
  wardrobeText,
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

test('background reads update shared custody without loading flashes or changing filters',async()=>{
  let hold:ReturnType<typeof deferred<Overview>>|undefined;
  const stored={...receipt,status:'stored' as const,pickupApproved:true};
  const store=new WardrobeStore((async(path)=>path.includes('/deposits/')?{deposit:stored}:path.includes('?')?(hold?await hold.promise:{...overview(),deposits:[stored]}):fallback(path)) as Request);
  await store.change({eventId:id(1),search:'Guest',history:true});store.select({...stored,pickupApproved:false});
  const flags:boolean[]=[];store.subscribe(()=>flags.push(store.snapshot().loading));hold=deferred<Overview>();
  const read=store.refresh(true,{background:true});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.snapshot().loading,false);hold.resolve({...overview(),deposits:[stored],zones:[{...zone,occupied:1}]});await read;
  assert.equal(flags.some(Boolean),false);assert.equal(store.snapshot().search,'Guest');assert.equal(store.snapshot().history,true);
  assert.equal(store.snapshot().selected?.pickupApproved,true);assert.equal(store.snapshot().overview?.zones[0]?.occupied,1);store.dispose();
});

test('manual refresh joins and promotes the background request instead of racing it',async()=>{
  let hold:ReturnType<typeof deferred<Overview>>|undefined,overviewReads=0;
  const store=new WardrobeStore((async(path)=>{if(path.includes('?')){overviewReads++;return hold?await hold.promise:overview();}return fallback(path);}) as Request);
  await store.change({eventId:id(1)});hold=deferred<Overview>();overviewReads=0;
  const background=store.refresh(true,{background:true});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(store.snapshot().loading,false);const manual=store.refresh(true);assert.equal(manual,background);assert.equal(store.snapshot().loading,true);
  hold.resolve(overview());await manual;assert.equal(overviewReads,1);assert.equal(store.snapshot().loading,false);store.dispose();
});

test('switching to staff during a personal read coalesces one awaited scope upgrade',async()=>{
  const mine=deferred<{deposits:Deposit[];staffAccess:boolean}>(),events=deferred<{id:string;title:string;canManage:boolean}[]>();
  const paths:string[]=[];let active=0,maximum=0;
  const store=new WardrobeStore((async(path)=>{paths.push(path);active++;maximum=Math.max(maximum,active);try{
    if(path==='/wardrobe/mine'&&paths.length===1)return await mine.promise;
    if(path==='/wardrobe/events')return await events.promise;
    return fallback(path);
  }finally{active--;}}) as Request,{autoSelectFirst:false});
  const personal=store.refresh(false,{background:true});await new Promise(resolve=>setImmediate(resolve));
  const staff=store.refresh(true),second=store.refresh(true,{background:true});assert.equal(staff,second);
  let finished=false;void staff.then(()=>{finished=true;});mine.resolve({deposits:[],staffAccess:true});await personal;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(finished,false);assert.equal(paths.filter(path=>path==='/wardrobe/events').length,1);
  events.resolve([{id:id(1),title:'Night',canManage:true}]);await staff;
  assert.equal(maximum,1);assert.equal(store.snapshot().events[0]?.id,id(1));assert.equal(store.snapshot().loading,false);store.dispose();
});

test('background failure preserves action error and data; successful live reads do not dismiss the action error',async()=>{
  let fail=false;const store=new WardrobeStore((async(path)=>{if(fail)throw Error('offline');return fallback(path);}) as Request);
  await store.change({eventId:id(1)});await store.reserve('invalid',zone.id,{coat:1,bag:0,backpack:0},false,()=>id(9));const actionError=store.snapshot().error;
  assert.ok(actionError);await store.refresh(true,{background:true});assert.equal(store.snapshot().error,actionError);
  const previous=store.snapshot().overview;fail=true;await store.refresh(true,{background:true});assert.equal(store.snapshot().overview,previous);assert.equal(store.snapshot().error,actionError);assert.ok(store.snapshot().syncError);assert.equal(store.snapshot().loading,false);
  fail=false;await store.refresh(true,{background:true});assert.equal(store.snapshot().syncError,null);assert.equal(store.snapshot().error,actionError);
  await store.refresh(true);assert.equal(store.snapshot().error,null);store.dispose();
});

test('localized HTTP auth failures in background clear all private data and search context',async()=>{
  for(const authError of [Object.assign(Error('Sesiunea a expirat'),{status:401}),Object.assign(Error('Acces interzis'),{status:403}),Object.assign(Error('Request failed'),{code:'WARDROBE_ACCESS_DENIED'})]){
    let fail=false;const store=new WardrobeStore((async(path)=>{if(fail)throw authError;return fallback(path);}) as Request);
    await store.change({eventId:id(1),search:'Private guest',cursor:id(9),history:true});store.select(receipt);assert.ok(store.snapshot().mine);fail=true;
    await store.refresh(true,{background:true});const state=store.snapshot();
    assert.equal(state.mine,undefined);assert.equal(state.overview,undefined);assert.equal(state.selected,undefined);assert.deepEqual(state.events,[]);assert.equal(state.eventId,'');assert.equal(state.search,'');assert.equal(state.cursor,'');assert.equal(state.error,authError);assert.equal(state.syncError,null);store.dispose();
  }
});

test('own custody mutations reconcile silently while still publishing confirmed results',async()=>{
  const stored={...receipt,status:'stored' as const};
  const store=new WardrobeStore((async(path,options)=>options?.method==='POST'?{deposit:stored}:path.includes('/deposits/')?{deposit:stored}:fallback(path)) as Request);
  await store.change({eventId:id(1)});store.select(receipt);const flags:boolean[]=[];store.subscribe(()=>flags.push(store.snapshot().loading));
  await store.command({action:'store',depositId:receipt.id,revision:receipt.revision});assert.equal(store.snapshot().selected?.status,'stored');assert.equal(flags.some(Boolean),false);store.dispose();
});
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

test("recovered initial reads clear their error without waiting for manual refresh", async () => {
  const failure = new Error("offline");
  let offline = true;
  const store = new WardrobeStore((async path => {
    if (offline) throw failure;
    return fallback(path);
  }) as Request);
  await store.refresh(true);
  assert.equal(store.snapshot().error, failure);
  offline = false;
  await store.refresh(true, { background: true });
  assert.equal(store.snapshot().error, null);
  assert.equal(store.snapshot().syncError, null);
  assert.ok(store.snapshot().overview);
});

test("localized authorization failures display an access message rather than an operation failure", () => {
  for (const status of [401, 403]) {
    const failure = Object.assign(new Error("Sesiunea a expirat"), { status });
    for (const ro of [false, true])
      assert.equal(wardrobeError(failure, ro), wardrobeText(ro).access);
  }
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
  await new Promise(resolve=>setImmediate(resolve));
  store.dispose();
  assert.equal(signal?.aborted, true);
  pending.resolve({ deposits: [receipt], staffAccess: false });
  await reading;
  assert.equal(store.snapshot().mine, undefined);
});

test('teardown before a queued live read prevents even starting its transport',async()=>{
  let calls=0;const store=new WardrobeStore((async(path)=>{calls++;return fallback(path);}) as Request);
  const read=store.refresh(true,{background:true});store.dispose();await read;
  assert.equal(calls,0);assert.equal(store.snapshot().mine,undefined);assert.deepEqual(store.snapshot().events,[]);
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
