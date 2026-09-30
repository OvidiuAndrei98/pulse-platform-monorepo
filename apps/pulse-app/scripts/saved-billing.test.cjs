const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/features/checkout/savedBillingDetails.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const details = { type: "company", name: "Test Company", taxId: "RO123", registrationNumber: "J1/1/2026", address: "Test street 1", city: "Cluj-Napoca", county: "Cluj", sector: "", country: "Romania" };

function storage(native = false) {
  const web = new Map();
  const secure = new Map();
  const api = {};
  vm.runInNewContext(compiled, {
    exports: api,
    require: (name) => name.includes("secure-storage") ? { SecureStorage: {
      getItem: async (key) => secure.get(key) ?? null,
      setItem: async (key, value) => { secure.set(key, value); },
      removeItem: async (key) => { secure.delete(key); },
    } } : { isNativePlatform: () => native },
    window: { localStorage: {
      getItem: (key) => web.get(key) ?? null,
      setItem: (key, value) => { web.set(key, value); },
      removeItem: (key) => { web.delete(key); },
    } },
  });
  return { api, web, secure };
}

test("saved addresses persist, are account scoped, and can be removed", async () => {
  const { api } = storage();
  await api.saveBillingDetails(details, "account-a");
  assert.equal(JSON.stringify(await api.readSavedBillingDetails("account-a")), JSON.stringify(details));
  assert.equal(await api.readSavedBillingDetails("account-b"), null);
  assert.equal(await api.readSavedBillingDetails(), null);
  await api.saveBillingDetails({ ...details, name: "Guest" });
  await api.removeSavedBillingDetails("account-a");
  assert.equal(await api.readSavedBillingDetails("account-a"), null);
  assert.equal((await api.readSavedBillingDetails()).name, "Guest");
});

test("native persistence uses secure storage and keeps web storage empty", async () => {
  const { api, web, secure } = storage(true);
  await api.saveBillingDetails(details, "account-a");
  assert.equal(web.size, 0);
  assert.equal(secure.size, 1);
  assert.equal((await api.readSavedBillingDetails("account-a")).taxId, details.taxId);
  await api.removeSavedBillingDetails("account-a");
  assert.equal(secure.size, 0);
});

test("corrupt or incomplete saved data is ignored and unknown fields are discarded", () => {
  const { api } = storage();
  for (const raw of [null, "{", "null", "[]", JSON.stringify({ ...details, city: 12 }), JSON.stringify({ ...details, type: "invalid" })]) {
    assert.equal(api.parseSavedBillingDetails(raw), null);
  }
  const restored = api.parseSavedBillingDetails(JSON.stringify({ ...details, cardNumber: "not-an-address-field" }));
  assert.equal(restored.cardNumber, undefined);
  assert.equal(restored.address, details.address);
});

test("storage errors are surfaced so checkout can continue without claiming a save", async () => {
  const { api, web } = storage();
  web.set = () => { throw new Error("Storage unavailable"); };
  await assert.rejects(api.saveBillingDetails(details), /Storage unavailable/);
});
