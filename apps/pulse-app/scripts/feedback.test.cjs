const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../src/", file), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: () => ({}), setTimeout, clearTimeout, ...globals });
  return exports;
}
const { checkPaymentConfirmation } = load("features/checkout/confirmation.ts");
const noWait = async () => {};

test("unconfirmed payment stops polling and remains pending", async () => {
  let calls = 0;
  const result = await checkPaymentConfirmation(async () => { calls++; return { status: "pending" }; }, () => true, noWait);
  assert.equal(result, "pending");
  assert.equal(calls, 4);
});
test("connection failure never claims that payment failed", async () => {
  let calls = 0;
  const result = await checkPaymentConfirmation(async () => { calls++; throw new TypeError("offline"); }, () => true, noWait);
  assert.equal(result, "unavailable");
  assert.equal(calls, 4);
});
test("transient connection failure can recover to a confirmed payment", async () => {
  let calls = 0;
  const result = await checkPaymentConfirmation(async () => {
    if (++calls === 1) throw new Error("temporary");
    return { status: "completed" };
  }, () => true, noWait);
  assert.equal(result, "completed");
  assert.equal(calls, 2);
});
test("confirmed failure stops checks immediately", async () => {
  let calls = 0;
  assert.equal(await checkPaymentConfirmation(async () => { calls++; return { status: "failed" }; }, () => true, noWait), "failed");
  assert.equal(calls, 1);
});
test("leaving confirmation ignores late results and stops further requests", async () => {
  let active = true;
  let calls = 0;
  const result = await checkPaymentConfirmation(async () => { calls++; active = false; return { status: "completed" }; }, () => active, noWait);
  assert.equal(result, null);
  assert.equal(calls, 1);
});
test("requests which never resolve are bounded by a timeout", async () => {
  const api = load("features/checkout/confirmation.ts", { setTimeout: (callback) => setTimeout(callback, 1) });
  assert.equal(await api.checkPaymentConfirmation(() => new Promise(() => {}), () => true, noWait), "unavailable");
});
test("billing errors identify missing fields, including company and Bucharest requirements", () => {
  const { emptyInvoiceDetails, getInvoiceFieldErrors, validateInvoiceDetails } = load("features/checkout/InvoiceDetailsFields.tsx");
  const details = emptyInvoiceDetails();
  assert.deepEqual(Object.keys(getInvoiceFieldErrors(details)), ["name", "address", "city", "county"]);
  Object.assign(details, { type: "company", name: "Test", address: "Street 1", city: "București" });
  assert.deepEqual(Object.keys(getInvoiceFieldErrors(details)), ["taxId", "sector"]);
  Object.assign(details, { taxId: "RO123", sector: "Sector 1" });
  assert.equal(validateInvoiceDetails(details), null);
  details.city = "Cluj";
  assert.equal(getInvoiceFieldErrors(details).county, "checkout.invoiceCountyRequired");
});
test("email validation works without a mounted billing input", () => {
  const { checkoutEmailError } = load("features/checkout/validateEmail.ts");
  assert.equal(checkoutEmailError("  test+ticket@example.com  "), null);
  assert.equal(checkoutEmailError(" "), "eventSheet.emailRequired");
  for (const email of ["name", "a@@example.com", "a b@example.com", "a@-bad.com"]) {
    assert.equal(checkoutEmailError(email), "checkout.emailInvalid");
  }
});
