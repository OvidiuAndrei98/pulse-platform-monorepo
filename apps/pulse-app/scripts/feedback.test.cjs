const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { modules } = require("./helpers/qaHarness.cjs");

function load(file, globals = {}) { return modules({},globals).load(file); }
const { checkPaymentConfirmation } = load("@packages/app-core/checkout/confirmation");
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
  const api = load("@packages/app-core/checkout/confirmation", { setTimeout: (callback) => setTimeout(callback, 1) });
  assert.equal(await api.checkPaymentConfirmation(() => new Promise(() => {}), () => true, noWait), "unavailable");
});
test("billing errors identify missing fields, including company and Bucharest requirements", () => {
  const { emptyInvoiceDetails, getInvoiceFieldErrors, validateInvoiceDetails } = load("@packages/app-core/checkout/invoiceDetails");
  const details = emptyInvoiceDetails();
  assert.deepEqual(Object.keys(getInvoiceFieldErrors(details)), ["name", "address", "city", "county"]);
  Object.assign(details, { type: "company", name: "Test", address: "Street 1", city: "București" });
  assert.deepEqual(Object.keys(getInvoiceFieldErrors(details)), ["taxId", "sector"]);
  Object.assign(details, { taxId: "RO123", sector: "Sector 1" });
  assert.equal(validateInvoiceDetails(details), null);
  details.city = "Cluj";
  assert.equal(getInvoiceFieldErrors(details).county, "checkout.invoiceCountyRequired");
});

test("the billing component keeps the original helper exports after extraction", () => {
  const loader = modules({ "react-i18next": {}, "@/features/events/form/ThemedSelect": {}, '@/components/ui/Field': {Input:'input'} });
  const helpers = loader.load("@packages/app-core/checkout/invoiceDetails");
  const component = loader.load("features/checkout/InvoiceDetailsFields");
  for (const key of ["emptyInvoiceDetails", "getInvoiceFieldErrors", "isBucharestAddress", "validateInvoiceDetails"]) {
    assert.equal(component[key], helpers[key], key);
  }
});

test("billing validates stored fields against both API byte limits and canonical sectors", () => {
  const { emptyInvoiceDetails, getInvoiceFieldErrors } = load("@packages/app-core/checkout/invoiceDetails");
  const valid = { ...emptyInvoiceDetails("Buyer"), address: "Street", city: "Cluj", county: "Cluj" };
  assert.equal(getInvoiceFieldErrors({ ...valid, name: "ă".repeat(100) }).name, undefined);
  assert.equal(getInvoiceFieldErrors({ ...valid, name: "ă".repeat(101) }).name, "feedback.fieldTooLong");
  assert.equal(getInvoiceFieldErrors({ ...valid, taxId: "A".repeat(33), type: "company" }).taxId, "feedback.fieldTooLong");
  assert.equal(getInvoiceFieldErrors({ ...valid, address: "A".repeat(301) }).address, "feedback.fieldTooLong");
  assert.equal(getInvoiceFieldErrors({ ...valid, city: "Bucuresti", sector: "1" }).sector, "checkout.invoiceSectorRequired");
  assert.equal(getInvoiceFieldErrors({ ...valid, city: "Bucuresti", sector: "Sector 6" }).sector, undefined);
});
test("email validation works without a mounted billing input", () => {
  const { checkoutEmailError } = load("@packages/app-core/checkout/validateEmail");
  assert.equal(checkoutEmailError("  test+ticket@example.com  "), null);
  assert.equal(checkoutEmailError(" "), "eventSheet.emailRequired");
  for (const email of ["name", "a@@example.com", "a b@example.com", "a@-bad.com"]) {
    assert.equal(checkoutEmailError(email), "checkout.emailInvalid");
  }
});
