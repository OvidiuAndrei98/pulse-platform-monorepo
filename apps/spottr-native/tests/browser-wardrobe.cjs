// Both clients, simulated API/accounts/camera only; no production writes.
const assert = require("node:assert/strict");
const QRCode = require("../../pulse-app/node_modules/qrcode");
const { withBrowser } = require("./browser-harness.cjs");
withBrowser(
  async ({ base, call, evaluate, until, delay, capture, errors }) => {
    if(process.env.BROWSER_NETWORK_DEBUG){await call('Network.enable');await call('Log.enable');}
    if(process.env.WARDROBE_BYPASS_SW)await call('Network.setBypassServiceWorker',{bypass:true});
    const next = !!process.env.WARDROBE_TEST_URL,
      origin = process.env.WARDROBE_TEST_URL || base;
    await call("Page.addScriptToEvaluateOnNewDocument", {
      source: `(${function mock() {
        const original = window.fetch.bind(window),
          id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
        const customer =
            new URLSearchParams(location.search).get("qa") === "customer",
          operator =
            new URLSearchParams(location.search).get("qa") === "operator";
        const user = {
          id: id(customer ? 4 : 1),
          username: customer ? "Guest" : "Wardrobe Staff",
          email: "wardrobe@example.invalid",
          role: customer || operator ? "user" : "organizer",
          preferredLanguage: "en",
          showAttendancePublicly: true,
          hasPassword: true,
          createdAt: "2026-10-01T00:00:00Z",
        };
        localStorage.setItem(
          "spottr-native.session.v1",
          JSON.stringify({ token: "wardrobe-test-only", user }),
        );
        localStorage.setItem("pulse_token", "wardrobe-test-only");
        localStorage.setItem("i18nextLng", "en");
        const deposit = () => ({
          id: id(3),
          eventId: id(1),
          eventTitle: "Night QA",
          userId: id(4),
          customerName: "Guest",
          zoneId: id(2),
          zoneName: "Desk A",
          number: "A001",
          status: "reserved",
          items: { coat: 1, bag: 1, backpack: 0 },
          remaining: { coat: 1, bag: 1, backpack: 0 },
          revision: 1,
          reservedUntil: new Date(Date.now() + 300000).toISOString(),
          createdAt: new Date().toISOString(),
          storedAt: null,
          returnedAt: null,
          pickupId: null,
          pickupItems: null,
          pickupExpiresAt: null,
          pickupApproved: false,
        });
        const state = (window.__wardrobeQA = {
          qr: "",
          writes: [],
          reads: [],
          cameraErrors: [],
          fail: false,
          ended: false,
          zones: [
            {
              id: id(2),
              name: "Desk A",
              prefix: "A",
              kind: "any",
              capacity: 2,
              enabled: true,
              revision: 1,
              occupied: 0,
            },
          ],
          staff: [],
          deposits: [],
          audit: [],
        });
        if (customer) {
          const d = deposit();
          d.status = "stored";
          d.pickupId = id(9);
          d.pickupItems = { coat: 0, bag: 1, backpack: 0 };
          d.pickupExpiresAt = new Date(Date.now() + 180000).toISOString();
          state.deposits.push(d);
        }
        const getMedia=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia=async(...args)=>{try{return await getMedia(...args);}catch(error){state.cameraErrors.push('media: '+error.name+': '+error.message);throw error;}};
        const play=HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play=async function(...args){try{return await play.apply(this,args);}catch(error){state.cameraErrors.push('play: '+error.name+': '+error.message);throw error;}};
        window.addEventListener('error',event=>{if(event.target?.src)state.cameraErrors.push('asset: '+event.target.src);},true);
        window.BarcodeDetector = class {
          async detect() {
            return state.qr
              ? [
                  {
                    rawValue: state.qr,
                    format: "qr_code",
                    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
                    cornerPoints: [],
                  },
                ]
              : [];
          }
        };
        window.fetch = async (url, options = {}) => {
          const address = new URL(
            typeof url === "string" ? url : url.url || String(url),
            location.href,
          );
          if (!address.pathname.includes("/api/v1/"))
            return original(url, options);
          const route = address.pathname.split("/api/v1")[1],
            method = options.method || "GET",
            body = options.body ? JSON.parse(options.body) : null;
          const reply = (value, status = 200) =>
            Promise.resolve(
              new Response(JSON.stringify(value), {
                status,
                headers: { "Content-Type": "application/json" },
              }),
            );
          state.reads.push(route);
          if (route === "/users/me" || route === "/auth/me") return reply(user);
          if (route === "/wardrobe/mine")
            return reply({
              staffAccess: !customer,
              deposits: customer
                ? state.deposits.filter((d) => d.status === "stored")
                : [],
            });
          if (route === "/wardrobe/events")
            return reply(
              customer
                ? []
                : [{ id: id(1), title: "Night QA", canManage: !operator }],
            );
          if (route.endsWith("/confirm")) {
            state.writes.push({ route, body });
            const d = state.deposits[0];
            if (body.approve) d.pickupApproved = true;
            else {
              d.pickupId = null;
              d.pickupApproved = false;
            }
            d.revision++;
            return reply({ ok: true });
          }
          if (route.endsWith("/commands")) {
            state.writes.push({ route, body });
            if (state.fail) return reply({ error: "WARDROBE_CHANGED" }, 409);
            let d = state.deposits.find((d) => d.id === body.depositId);
            if (body.action === "zone") {
              state.zones.push({
                id: id(10),
                ...body,
                revision: 1,
                occupied: 0,
              });
              return reply({ ok: true });
            }
            if (body.action === "staff") {
              state.staff.push({
                id: id(11),
                name: "New staff",
                role: body.role,
              });
              return reply({ ok: true });
            }
            if (body.action === "remove-staff") {
              state.staff = [];
              return reply({ ok: true });
            }
            if (body.action === "lookup") return reply({deposits:state.deposits.filter(d=>d.status==="stored")});
            if (body.action === "reserve") {
              if (!state.deposits.length) {
                d = deposit();
                d.items = { ...body.items };
                d.remaining = { ...body.items };
                state.deposits.push(d);
              } else d = state.deposits[0];
            }
            if (body.action === "store") d.status = "stored";
            if (body.action === "request-pickup") {
              d.pickupId = id(9);
              d.pickupItems = body.items;
              d.pickupApproved = false;
              d.pickupExpiresAt = new Date(Date.now() + 180000).toISOString();
            }
            if (body.action === "return") {
              for (const k of ["coat", "bag", "backpack"])
                d.remaining[k] -= d.pickupItems[k];
              d.pickupId = null;
              d.pickupApproved = false;
              if (Object.values(d.remaining).every((v) => v === 0))
                d.status = "returned";
            }
            if (body.action === "recover") {
              d.remaining = { coat: 0, bag: 0, backpack: 0 };
              d.status = "returned";
            }
            if (body.action === "cancel") d.status = "cancelled";
            d.revision++;
            return reply({ deposit: d });
          }
          if (
            route.includes("/wardrobe/events/") &&
            route.includes("/deposits/")
          )
            return reply({
              deposit: state.deposits.find(
                (d) => d.id === route.split("/").at(-1),
              ),
            });
          if (route.startsWith("/wardrobe/events/"))
            return reply({
              eventId: id(1),
              title: "Night QA",
              canManage: !operator,
              canRecover: !operator,
              accepting: !state.ended,
              eventEnded: state.ended,
              unclaimedCount: state.ended
                ? state.deposits.filter((d) => d.status === "stored").length
                : 0,
              unclaimedItems: state.ended
                ? state.deposits
                    .filter((d) => d.status === "stored")
                    .reduce(
                      (sum, d) =>
                        sum +
                        Object.values(d.remaining).reduce((a, b) => a + b, 0),
                      0,
                    )
                : 0,
              zones: state.zones,
              staff: state.staff,
              deposits: state.deposits
                .filter((d) =>
                  address.searchParams.get("unclaimed") === "true"
                    ? state.ended && d.status === "stored"
                    : address.searchParams.get("history") === "true"
                      ? ["returned", "cancelled"].includes(d.status)
                      : ["reserved", "stored"].includes(d.status),
                )
                .filter((d) =>
                  (d.customerName + " " + d.number)
                    .toLowerCase()
                    .includes(
                      (address.searchParams.get("q") || "").toLowerCase(),
                    ),
                )
                .sort((a, b) =>
                  address.searchParams.get("unclaimed") === "true"
                    ? Date.parse(a.storedAt ?? a.createdAt) -
                      Date.parse(b.storedAt ?? b.createdAt)
                    : Date.parse(b.createdAt) - Date.parse(a.createdAt),
                ),
              nextCursor: "",
              audit: state.audit,
            });
          if (route === "/notifications")
            return reply({ items: [], unreadCount: 0 });
          if (route.includes("/organizer/profile"))
            return reply({ error: "not found" }, 404);
          return reply([]);
        };
      }.toString()})();`,
    });
    if (next) {
      const qr = QRCode.create(
        "glow://friend/00000000-0000-4000-8000-000000000004",
      );
      await call("Page.addScriptToEvaluateOnNewDocument", {
        source: `(${function mockQRFrame(size, data) {
          // A deterministic sized stream: some headless fake devices expose
          // only 2x2 pixels, which cannot contain an actual decodable QR.
          navigator.mediaDevices.getUserMedia=async()=>{const frame=document.createElement('canvas');frame.width=640;frame.height=640;const ctx=frame.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,640);return frame.captureStream(5);};
          const draw = CanvasRenderingContext2D.prototype.drawImage;
          CanvasRenderingContext2D.prototype.drawImage = function (
            source,
            ...args
          ) {
            if (source instanceof HTMLVideoElement && window.__wardrobeQA?.qr) {
              const side = Math.min(this.canvas.width, this.canvas.height),
                unit = side / (size + 8);
              this.fillStyle = "white";
              this.fillRect(0, 0, side, side);
              this.fillStyle = "black";
              for (let y = 0; y < size; y++)
                for (let x = 0; x < size; x++)
                  if (data[y * size + x])
                    this.fillRect(
                      Math.floor((x + 4) * unit),
                      Math.floor((y + 4) * unit),
                      Math.ceil(unit),
                      Math.ceil(unit),
                    );
              window.__wardrobeQA.frames=(window.__wardrobeQA.frames||0)+1;
              window.__wardrobeQA.canvas=this.canvas;
              return;
            }
            return draw.call(this, source, ...args);
          };
        }.toString()})(${qr.modules.size},${JSON.stringify(Array.from(qr.modules.data))});`,
      });
    }
    const textClick = async (text, container = "document") => {
      const exp = `Array.from(${container}.querySelectorAll('button,[role="button"],[role="tab"]')).find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getBoundingClientRect().width>0&&!e.disabled&&e.getAttribute('aria-disabled')!=='true')`;
      await until(exp);
      await evaluate(`${exp}.click()`);
    };
    const fill = async (label, value) => {
      const exp = `Array.from(document.querySelectorAll('input,textarea')).find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}||e.closest('label')?.firstChild?.textContent===${JSON.stringify(label)})`;
      await until(exp);
      await evaluate(
        `{const el=${exp};el.scrollIntoView({block:'center'});el.focus();el.select();}`,
      );
      await call("Input.insertText", { text: value });
    };
    const open = async (suffix) => {
      await call("Page.navigate", { url: origin + "/wardrobe?qa=" + suffix });
      await until(`document.body?.innerText.includes('${suffix==="staff"?"Choose the event":"Account QR"}')`);
    };
    const chooseEvent=async()=>{await until(`document.querySelector('[data-testid="wardrobe-event-00000000-0000-4000-8000-000000000001"]')`);await evaluate(`document.querySelector('[data-testid="wardrobe-event-00000000-0000-4000-8000-000000000001"]').click()`);};
    const taskClick=async key=>{await until(`document.querySelector('[data-testid="wardrobe-task-${key}"]')`);await evaluate(`document.querySelector('[data-testid="wardrobe-task-${key}"]').click()`);};
    await open("staff");
    assert.equal(await evaluate(`document.body.innerText.includes('Account QR')`),false,'Organizers have no personal belongings surface');
    assert.equal(await evaluate(`window.__wardrobeQA.reads.includes('/wardrobe/mine')`),false,'Organizers never fetch personal belongings');
    assert.equal(await evaluate(`window.__wardrobeQA.reads.some(p=>p.startsWith('/wardrobe/events/'))`),false,'No silent event selection');
    await capture('wardrobe-'+(next?'next':'native')+'-events');
    await chooseEvent();await until(`document.querySelector('[data-testid="wardrobe-task-receive"]')`);await capture('wardrobe-'+(next?'next':'native')+'-tasks');await taskClick('setup');
    await until(`document.body.innerText.includes('Create zone')`);
    await fill("Zone name", "Desk B");
    await fill("Prefix (A, B...)", "B");
    await fill("Number of places", "25");
    await textClick("Create zone");
    await until(`window.__wardrobeQA.zones.length===2`);
    assert.equal(await evaluate("window.__wardrobeQA.zones[1].capacity"), 25);
    await textClick("Team");
    await fill("Staff account email", "employee@example.invalid");
    await textClick("Grant access");
    await until(`document.body.innerText.includes('New staff')`);
    assert.equal(
      await evaluate("window.__wardrobeQA.staff[0].role"),
      "operator",
    );
    await capture("wardrobe-" + (next ? "next" : "native") + "-setup");
    await textClick("Back to operations");await taskClick('receive');
    await until(`document.body.innerText.includes('Scan account')`);
    await textClick("Scan account");
    if (!next) {
      await until(
        `document.querySelector('video')||document.body.innerText.includes('Allow camera access')`,
      );
      if (
        await evaluate(
          `document.body.innerText.includes('Allow camera access')`,
        )
      )
        await textClick("Allow camera access");
    } else {
      await textClick("Scan QR", "document.querySelector('[role=\"dialog\"]')");
    }
    await until(`!!document.querySelector('video')`, 20000);
    await evaluate(
      `window.__wardrobeQA.qr='glow://friend/00000000-0000-4000-8000-000000000004'`,
    );
    try {await until(`document.querySelector('[aria-label="+ Coats"]')`,20000);}catch(error){console.error(await evaluate('({errors:window.__wardrobeQA.cameraErrors,frames:window.__wardrobeQA.frames,video:document.querySelector("video")&&{ready:document.querySelector("video").readyState,width:document.querySelector("video").videoWidth,height:document.querySelector("video").videoHeight}})'),errors);throw error;}
    assert.equal(await evaluate(`window.__wardrobeQA.writes.filter(w=>w.body.action==='reserve').length`),0,'Scanning alone never reserves belongings');
    await evaluate(`document.querySelector('[aria-label="+ Coats"]').click();document.querySelector('[aria-label="+ Bags"]').click();window.__wardrobeQA.qr=''`);
    await textClick("Continue");
    if(next){await until(`document.querySelector('select')`);await evaluate(`{const el=document.querySelector('select');el.value='00000000-0000-4000-8000-000000000002';el.dispatchEvent(new Event('change',{bubbles:true}));}`);}
    else{await until(`document.querySelector('[aria-label="Desk zone"]')`);await evaluate(`document.querySelector('[aria-label="Desk zone"]').click()`);await until(`Array.from(document.querySelectorAll('[role="button"]')).find(e=>e.textContent.startsWith('Desk A ·')&&e.getBoundingClientRect().width>0)`);await evaluate(`Array.from(document.querySelectorAll('[role="button"]')).find(e=>e.textContent.startsWith('Desk A ·')&&e.getBoundingClientRect().width>0).click()`);}
    await textClick("Reserve storage");await until(`document.querySelector('[data-testid="wardrobe-selected"]')`);
    assert.equal(
      await evaluate(
        `window.__wardrobeQA.writes.filter(w=>w.body.action==='reserve').length`,
      ),
      1,
    );
    assert.deepEqual(
      await evaluate(
        `window.__wardrobeQA.writes.find(w=>w.body.action==='reserve').body.items`,
      ),
      { coat: 1, bag: 1, backpack: 0 },
    );
    await textClick("Checked in");
    await until(`document.body.innerText.includes('Receive the next customer')`);
    await textClick("Back to operations");await taskClick('pickup');
    await until(`document.querySelector('[data-testid="wardrobe-record"]')`);await evaluate(`document.querySelector('[data-testid="wardrobe-record"]').click()`);
    await until(`document.body.innerText.includes('Request collection approval')`);
    await evaluate(
      `document.querySelector('[data-testid="wardrobe-selected"] [aria-label="− Coats"]').click()`,
    );
    await textClick("Request collection approval");
    await until(
      `document.body.innerText.includes('Waiting for customer approval')`,
    );
    assert.equal(
      await evaluate(`document.body.innerText.includes('Items handed over')`),
      false,
    );
    assert.deepEqual(
      await evaluate(
        `window.__wardrobeQA.writes.find(w=>w.body.action==='request-pickup').body.items`,
      ),
      { coat: 0, bag: 1, backpack: 0 },
    );
    await evaluate(
      `window.__wardrobeQA.deposits[0].pickupApproved=true;window.__wardrobeQA.deposits[0].revision++`,
    );
    await delay(50);
    await textClick("Refresh");
    await until(`document.body.innerText.includes('Items handed over')`);
    await textClick("Items handed over");
    await until(`window.__wardrobeQA.deposits[0].remaining.bag===0`);
    assert.equal(
      await evaluate("window.__wardrobeQA.deposits[0].status"),
      "stored",
    );
    await capture("wardrobe-" + (next ? "next" : "native") + "-staff");
    await textClick("Back to operations");await taskClick("unclaimed");
    await until(
      `document.body.innerText.includes('Unclaimed belongings will appear here after the event ends.')`,
    );
    assert.equal(
      await evaluate(
        `document.querySelectorAll('[data-testid="wardrobe-record"]').length`,
      ),
      0,
    );
    await evaluate(
      `{const s=window.__wardrobeQA,d=s.deposits[0];s.ended=true;d.storedAt=new Date(Date.now()-3*86400000).toISOString();s.deposits.push({...d,id:'00000000-0000-4000-8000-000000000012',number:'A002',remaining:{coat:0,bag:1,backpack:0},storedAt:new Date(Date.now()-4*86400000).toISOString()},{...d,id:'00000000-0000-4000-8000-000000000013',status:'returned',number:'A003'},{...d,id:'00000000-0000-4000-8000-000000000014',status:'reserved',number:'A004'});}`,
    );
    await textClick("Refresh");
    await until(
      `document.body.innerText.includes('2 deposits · 2 items remaining')`,
    );
    assert.equal(
      await evaluate(
        `document.querySelectorAll('[data-testid="wardrobe-record"]').length`,
      ),
      2,
    );
    assert.ok(
      await evaluate(
        `document.querySelector('[data-testid="wardrobe-record"]').innerText.includes('A002')`,
      ),
    );
    assert.ok(
      await evaluate(
        `document.body.innerText.includes('Checked in 4 days ago')`,
      ),
    );
    await evaluate(
      `document.querySelector('[data-testid="wardrobe-unclaimed-summary"]').scrollIntoView({block:'start'})`,
    );
    await capture("wardrobe-" + (next ? "next" : "native") + "-unclaimed");
    await evaluate(
      `Array.from(document.querySelectorAll('[data-testid="wardrobe-record"]')).find(e=>e.innerText.includes('A001')).click()`,
    );
    await textClick("Other operations");
    if(next)assert.equal(await evaluate(`document.querySelector('[data-testid="wardrobe-selected"] select').value`),'','An advanced operation must not visually select the first zone before the operator chooses');
    await textClick("Assisted recovery");
    await fill(
      "How did you verify the right to collect?",
      "Verified ownership with the customer at the desk",
    );
    await textClick("I verified and handed over the items");
    await until(
      `document.body.innerText.includes('1 deposit · 1 item remaining')`,
    );
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
      "mobile overflow",
    );
    await open("operator");
    await textClick("Cloakroom staff");await chooseEvent();
    await until(`document.querySelector('[data-testid="wardrobe-task-receive"]')`);
    assert.equal(
      await evaluate(`document.body.innerText.includes('Setup')`),
      false,
    );
    await open("customer");
    await until(`document.body.innerText.includes('Approve collection')`);
    await textClick("Approve collection");
    await until(
      `document.body.innerText.includes('Approved. Staff will hand over your belongings.')`,
    );
    assert.equal(
      await evaluate("window.__wardrobeQA.writes[0].body.pickupId"),
      "00000000-0000-4000-8000-000000000009",
    );
    assert.equal(
      await evaluate(`document.body.innerText.includes('Cloakroom staff')`),
      false,
    );
    await capture("wardrobe-" + (next ? "next" : "native") + "-customer");
    await call("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(300);
    assert.ok(
      await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),
    );
    await capture("wardrobe-" + (next ? "next" : "native") + "-desktop");
    const relevant = errors.filter(
      (e) =>
        !/Download the React DevTools|Failed to load resource|favicon|props.pointerEvents/.test(
          e,
        ),
    );
    assert.deepEqual(relevant, []);
    console.log(
      "PASS " +
        (next ? "Next.js" : "Native web") +
        " cloakroom explicit event selection, organizer separation, staged intake, staff permissions, account QR camera, allocation, partial return, unclaimed filter/recovery, customer approval and responsive layout",
    );
  },
  { fakeCamera: true },
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
