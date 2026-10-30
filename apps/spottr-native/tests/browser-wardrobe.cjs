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
          preferredLanguage: new URLSearchParams(location.search).get("lang")==="ro"?"ro":"en",
          showAttendancePublicly: true,
          hasPassword: true,
          createdAt: "2026-10-01T00:00:00Z",
        };
        localStorage.setItem(
          "spottr-native.session.v1",
          JSON.stringify({ token: "wardrobe-test-only", user }),
        );
        localStorage.setItem("pulse_token", "wardrobe-test-only");
        localStorage.setItem("i18nextLng", user.preferredLanguage);
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
          if(state.authStatus&&route.startsWith("/wardrobe/"))return reply({error:"Sesiunea a expirat. Conectează-te din nou."},state.authStatus);
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
              customer || state.emptyEvents
                ? []
                : [{ id: id(1), title: "Night QA", canManage: !operator,status:"published",startTime:new Date(Date.now()-3600000).toISOString(),endTime:new Date(Date.now()+(state.ended?-3600000:86400000)).toISOString(),location:"Venue QA" },{id:id(20),title:"Past QA",canManage:!operator,status:"completed",startTime:"2020-01-01T12:00:00Z",endTime:"2020-01-01T20:00:00Z"},{id:id(21),title:"Draft QA",canManage:!operator,status:"draft"}],
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
      const exp = `Array.from(${container}.querySelectorAll('button,[role="button"],[role="tab"]')).find(e=>(e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)})&&e.getBoundingClientRect().width>0&&!e.disabled&&e.getAttribute('aria-disabled')!=='true')`;
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
      await until(`document.body?.innerText.includes('${suffix.includes('lang=ro')?'Evenimente active':suffix==="staff"?"Active events":"Account QR"}')`);
    };
    const chooseEvent=async()=>{await until(`document.querySelector('[data-testid="wardrobe-event-00000000-0000-4000-8000-000000000001"]')`);await evaluate(`document.querySelector('[data-testid="wardrobe-event-00000000-0000-4000-8000-000000000001"]').click()`);};
    const taskClick=async key=>{await until(`document.querySelector('[data-testid="wardrobe-task-${key}"]')`);await evaluate(`document.querySelector('[data-testid="wardrobe-task-${key}"]').click()`);};
    await open("staff");
    const refreshSize=await evaluate(`{const button=Array.from(document.querySelectorAll('button,[role="button"]')).find(e=>e.getAttribute('aria-label')==='Refresh');const r=button.getBoundingClientRect(),glyph=button.firstElementChild,g=glyph.getBoundingClientRect(),style=getComputedStyle(glyph),icon=button.querySelector('svg');({width:r.width,height:r.height,frame:g.width,frameHeight:g.height,radius:parseFloat(style.borderRadius),background:style.backgroundColor,icon:icon.getBoundingClientRect().width,stroke:getComputedStyle(icon).stroke})}`);
    assert.ok(refreshSize.width>=44&&refreshSize.height>=44,'A compact refresh icon keeps a real 44px touch target');
    assert.equal(refreshSize.frame,32,'The primary circle is 32px, never compressed by a flex child rule');
    assert.equal(refreshSize.frameHeight,32);
    assert.equal(refreshSize.radius,16);
    assert.equal(refreshSize.background,'rgb(255, 0, 68)','Refresh uses the application primary color');
    assert.equal(refreshSize.icon,16);
    assert.equal(refreshSize.stroke,'rgb(255, 255, 255)','The refresh icon is white on primary');
    assert.equal(await evaluate(`document.body.innerText.includes('Account QR')`),false,'Organizers have no personal belongings surface');
    assert.equal(await evaluate(`window.__wardrobeQA.reads.includes('/wardrobe/mine')`),false,'Organizers never fetch personal belongings');
    assert.equal(await evaluate(`window.__wardrobeQA.reads.some(p=>p.startsWith('/wardrobe/events/'))`),false,'No silent event selection');

    await until(`document.querySelector('[data-testid="wardrobe-event-00000000-0000-4000-8000-000000000001"]')`);
    assert.equal(await evaluate(`document.body.innerText.includes('Past QA')||document.body.innerText.includes('Draft QA')`),false,'Initial list contains active events only');
    await textClick('Other events (2)');await until(`document.body.innerText.includes('Past QA')&&document.body.innerText.includes('Draft QA')`);await textClick('Other events (2)');
    if(!next)assert.equal(await evaluate(`document.querySelector('[data-testid="wardrobe-event-00000000-0000-4000-8000-000000000001"]').getAttribute('aria-label').includes('Venue QA')`),true,'Screen reader name includes event metadata');
    await capture('wardrobe-'+(next?'next':'native')+'-events');
    await chooseEvent();await until(`document.querySelector('[data-testid="wardrobe-task-receive"][aria-selected="true"]')&&document.body.innerText.includes('Scan account')`);
    assert.equal(await evaluate(`!!document.querySelector('[data-testid="wardrobe-event-select"]')`),false,'No event selector inside the cloakroom');
    await delay(250);await capture('wardrobe-'+(next?'next':'native')+'-receive-tabs');
    assert.equal(await evaluate(`document.body.innerText.includes('Back to operations')`),false,'No intermediate card menu');
    await evaluate(`document.querySelector('[data-testid="wardrobe-task-receive"]').focus()`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35});
    await until(`document.activeElement?.getAttribute('data-testid')==='wardrobe-task-setup'`);
    assert.equal(await evaluate(`document.querySelector('[data-testid="wardrobe-task-receive"]').getAttribute('aria-selected')`),'true','Arrow/Home/End focus alone must not load a different task');
    if(next)await evaluate(`{window.__wardrobeQA.keys=[];for(const type of ['keydown','keyup','click'])window.addEventListener(type,e=>window.__wardrobeQA.keys.push({type,key:e.key,target:e.target?.getAttribute('data-testid'),prevented:e.defaultPrevented}),false);}`);
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    try{await until(`document.querySelector('[data-testid="wardrobe-task-setup"][aria-selected="true"]')`);}catch(error){if(next)console.error(await evaluate(`({keys:window.__wardrobeQA.keys,focus:document.activeElement?.outerHTML?.slice(0,600)})`));throw error;}
    await capture('wardrobe-'+(next?'next':'native')+'-tasks');
    await until(`document.body.innerText.includes('Create zone')`);
    const formStyle=await evaluate(`{const input=Array.from(document.querySelectorAll('input')).find(e=>e.getAttribute('aria-label')==='Zone name'||e.closest('label')?.firstChild?.textContent==='Zone name');const wrapper=input.closest('label')||input.parentElement,card=wrapper.parentElement,button=Array.from(document.querySelectorAll('button,[role="button"]')).find(e=>e.textContent==='Create zone'),text=Array.from(button.querySelectorAll('*')).find(e=>!e.childElementCount&&e.textContent==='Create zone')||button;({inputHeight:input.getBoundingClientRect().height,inputRadius:parseFloat(getComputedStyle(input).borderRadius),inputBackground:getComputedStyle(input).backgroundColor,buttonRadius:parseFloat(getComputedStyle(button).borderRadius),primaryText:getComputedStyle(text).color,cardRadius:parseFloat(getComputedStyle(card).borderRadius)})}`);
    assert.deepEqual(formStyle,{inputHeight:44,inputRadius:8,inputBackground:'rgba(0, 0, 0, 0.2)',buttonRadius:8,primaryText:'rgb(255, 255, 255)',cardRadius:10},'Cloakroom form surfaces and white primary text match the existing invoice form');
    await capture('wardrobe-'+(next?'next':'native')+'-form-mobile');
    await call('Emulation.setDeviceMetricsOverride',{width:1152,height:900,deviceScaleFactor:1,mobile:false});await delay(100);await capture('wardrobe-'+(next?'next':'native')+'-form-desktop');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await fill("Zone name", "Desk B");
    await fill("Prefix (A, B...)", "B");
    await fill("Number of places", "25");
    assert.equal(await evaluate(`{const button=Array.from(document.querySelectorAll('button,[role="button"]')).find(e=>e.textContent==='Create zone'),text=Array.from(button.querySelectorAll('*')).find(e=>!e.childElementCount&&e.textContent==='Create zone')||button;getComputedStyle(text).color}`),'rgb(255, 255, 255)','Enabled primary buttons also retain white text');
    await evaluate(`{const button=Array.from(document.querySelectorAll('button,[role="button"]')).find(e=>e.getAttribute('aria-label')==='Refresh');window.__wardrobeQA.loadingFlashes=0;window.__wardrobeQA.watch=new MutationObserver(()=>{if(button.disabled||button.getAttribute('aria-disabled')==='true')window.__wardrobeQA.loadingFlashes++;});window.__wardrobeQA.watch.observe(button,{attributes:true,attributeFilter:['disabled','aria-disabled']});window.__wardrobeQA.beforePoll=window.__wardrobeQA.reads.length;window.__wardrobeQA.draftFocus=document.activeElement;window.__wardrobeQA.zones[0].occupied=1;}`);
    await until(`window.__wardrobeQA.reads.length>window.__wardrobeQA.beforePoll`,8000);await delay(200);
    assert.equal(await evaluate('window.__wardrobeQA.loadingFlashes'),0,'Background synchronization never toggles the visible refresh/loading state');
    assert.equal(await evaluate('document.activeElement===window.__wardrobeQA.draftFocus'),true,'Background sync preserves keyboard focus in the draft');
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('input')).find(e=>e.getAttribute('aria-label')==='Zone name'||e.closest('label')?.firstChild?.textContent==='Zone name').value`),'Desk B','The draft survives remote changes');
    await evaluate(`{window.__wardrobeQA.zones[0].occupied=0;window.__wardrobeQA.beforeFocus=window.__wardrobeQA.reads.length;window.dispatchEvent(new Event('focus'));}`);await until(`window.__wardrobeQA.reads.length>window.__wardrobeQA.beforeFocus`,2000);await delay(50);await evaluate('window.__wardrobeQA.watch.disconnect()');

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
    await taskClick('receive');
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
    if(next){await until(`document.querySelector('[role="combobox"][aria-label="Desk zone"]')`);await evaluate(`document.querySelector('[role="combobox"][aria-label="Desk zone"]').click()`);await until(`document.querySelector('[role="option"]')`);await evaluate(`Array.from(document.querySelectorAll('[role="option"]')).find(el=>el.textContent.startsWith('Desk A ·')).click()`);}
    else{await until(`document.querySelector('[aria-label="Desk zone"]')`);await evaluate(`document.querySelector('[aria-label="Desk zone"]').click()`);await until(`Array.from(document.querySelectorAll('[role="button"]')).find(e=>e.textContent.startsWith('Desk A ·')&&e.getBoundingClientRect().width>0)`);await evaluate(`Array.from(document.querySelectorAll('[role="button"]')).find(e=>e.textContent.startsWith('Desk A ·')&&e.getBoundingClientRect().width>0).click()`);}
    await textClick("Reserve storage");await until(`document.querySelector('[data-testid="wardrobe-selected"]')`);
    await evaluate(`document.querySelector('[data-testid="wardrobe-back-events"]').click()`);
    await taskClick('pickup');
    assert.equal(await evaluate(`document.querySelector('[data-testid="wardrobe-task-receive"]').getAttribute('aria-selected')`),'true','A reserved place locks the active operation');
    assert.equal(await evaluate(`document.querySelector('[data-testid="wardrobe-task-pickup"]').disabled||document.querySelector('[data-testid="wardrobe-task-pickup"]').getAttribute('aria-disabled')==='true'`),true);

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
    await taskClick('pickup');
    await until(`document.querySelector('[data-testid="wardrobe-record"]')`);
    if(next){
      await call('Emulation.setDeviceMetricsOverride',{width:1152,height:900,deviceScaleFactor:1,mobile:false});
      assert.ok(await evaluate(`{const input=Array.from(document.querySelectorAll('input')).find(e=>e.closest('label')?.firstChild?.textContent==='Search name or number'),button=input.parentElement.parentElement.querySelector('button');Math.abs(input.getBoundingClientRect().bottom-button.getBoundingClientRect().bottom)<1}`),'Search input and button align at their bottom edge');
      await capture('wardrobe-next-pickup-desktop');
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    }
    await evaluate(`document.querySelector('[data-testid="wardrobe-record"]').click()`);
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
    await until(`document.body.innerText.includes('Items handed over')`,8000); // Another account's approval arrives through silent polling, without Refresh.
    await textClick("Items handed over");
    await until(`window.__wardrobeQA.deposits[0].remaining.bag===0`);
    assert.equal(
      await evaluate("window.__wardrobeQA.deposits[0].status"),
      "stored",
    );
    await capture("wardrobe-" + (next ? "next" : "native") + "-staff");
    await taskClick("unclaimed");
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
    if(next)assert.equal(await evaluate(`document.querySelector('[data-testid="wardrobe-selected"] [name="wardrobe-move-zone"]').value`),'','An advanced operation must not visually select the first zone before the operator chooses');
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
    await textClick('Back to events');await until(`document.body.innerText.includes('Active events')`);assert.equal(await evaluate(`!!document.querySelector('[data-testid="wardrobe-task-receive"]')`),false,'Back returns to the event list, not a context selector');
    await evaluate('window.__wardrobeQA.ended=false');await textClick('Refresh');await chooseEvent();
    await call('Emulation.setDeviceMetricsOverride',{width:320,height:760,deviceScaleFactor:1,mobile:true});await delay(200);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'No horizontal page overflow at 320px');
    await evaluate(`document.querySelector('[data-testid="wardrobe-task-receive"]').focus()`);await call('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End',windowsVirtualKeyCode:35});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'End',code:'End',windowsVirtualKeyCode:35});await delay(100);
    assert.equal(await evaluate(`{const r=document.activeElement.getBoundingClientRect();r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight}`),true,'Keyboard focus is visible after scrolling the tab rail');
    await capture('wardrobe-'+(next?'next':'native')+'-tabs-320');
    if(next){await call('Emulation.setDeviceMetricsOverride',{width:640,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("document.body.style.zoom='2'");await delay(200);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'Reflows at 200% zoom');await capture('wardrobe-next-200-percent');await evaluate("document.body.style.zoom=''");}
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await open('staff&lang=ro');await chooseEvent();await until(`document.querySelector('[data-testid="wardrobe-task-receive"]').textContent==='Primire'`);await delay(400);await capture('wardrobe-'+(next?'next':'native')+'-tabs-ro');

    await evaluate(`{window.__wardrobeQA.authStatus=401;window.dispatchEvent(new Event('focus'));}`);await until(`!document.body.innerText.includes('Night QA')&&!document.querySelector('[data-testid="wardrobe-selected"]')`);
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
