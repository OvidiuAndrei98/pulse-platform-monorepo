const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/features/checkout/savedBillingDetails.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const details = { type: "company", name: "Test Company", taxId: "RO123", registrationNumber: "J1/1/2026", address: "Test street 1", city: "Cluj-Napoca", county: "Cluj", sector: "", country: "Romania" };

function client(response = { details }) {
  const calls = [];
  const instance = {
    get: async (route) => { calls.push(["get", route]); return response; },
    put: async (route, options) => { calls.push(["put", route, options]); return options.body; },
    delete: async (route) => { calls.push(["delete", route]); },
  };
  const api = {};
  vm.runInNewContext(compiled, {
    exports: api,
    require: () => ({ ApiClient: { instance } }),
  });
  return { api, calls };
}

test("authenticated billing details are loaded from the account API", async () => {
  const { api, calls } = client();
  assert.equal(JSON.stringify(await api.readSavedBillingDetails("account-a")), JSON.stringify(details));
  assert.deepEqual(calls, [["get", "/users/me/billing-details"]]);
});

test("an account without saved details returns null", async () => {
  const { api } = client({});
  assert.equal(await api.readSavedBillingDetails("account-a"), null);
});

test("guests do not read or persist reusable billing details", async () => {
  const { api, calls } = client();
  assert.equal(await api.readSavedBillingDetails(), null);
  await assert.rejects(api.saveBillingDetails(details), /AUTHENTICATED_USER_REQUIRED/);
  await api.removeSavedBillingDetails();
  assert.deepEqual(calls, []);
});

test("saving replaces the account billing profile and deleting removes it", async () => {
  const { api, calls } = client();
  assert.equal(JSON.stringify(await api.saveBillingDetails(details, "account-a")), JSON.stringify(details));
  await api.removeSavedBillingDetails("account-a");
  assert.equal(calls[0][0], "put");
  assert.equal(calls[0][1], "/users/me/billing-details");
  assert.equal(JSON.stringify(calls[0][2].body), JSON.stringify(details));
  assert.deepEqual(calls[1], ["delete", "/users/me/billing-details"]);
});
