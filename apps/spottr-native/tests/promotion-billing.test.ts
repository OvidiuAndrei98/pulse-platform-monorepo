import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPromotionBillingDetails, getPromotionBillingFieldErrors, isPromotionBucharestAddress, normalizedCUI, promotionBillingFromSaved, savedCompanyBilling, validatePromotionBillingDetails } from '../../pulse-app/src/features/promotions/promotionBilling';
const base = { ...emptyPromotionBillingDetails(), address: 'Club Street 1', city: 'Cluj', county: 'Cluj' };
test('shared web and native promotion billing rejects empty required fields and accepts valid company address', () => {
  assert.deepEqual(getPromotionBillingFieldErrors(base), {});
  const errors = getPromotionBillingFieldErrors(emptyPromotionBillingDetails());
  assert.equal(errors.address, 'feedback.fieldRequired'); assert.equal(errors.city, 'feedback.fieldRequired'); assert.equal(errors.county, 'checkout.invoiceCountyRequired');
  assert.equal(validatePromotionBillingDetails(base), null);
});
test('Bucharest diacritics, country and sector boundaries match invoice validation', () => {
  const bucharest = { ...base, city: ' București ', county: '', country: ' România ' };
  assert.equal(isPromotionBucharestAddress(bucharest), true);
  for (const sector of ['', ' ', 'Sector 0', 'Sector 7', 'not a sector']) assert.equal(getPromotionBillingFieldErrors({ ...bucharest, sector }).sector, 'checkout.invoiceSectorRequired');
  for (const sector of ['Sector 1', 'sector 6', ' Sector 4 ']) assert.deepEqual(getPromotionBillingFieldErrors({ ...bucharest, sector }), {});
  assert.equal(isPromotionBucharestAddress({ ...bucharest, country: 'France' }), false);
});
test('promotion billing enforces the same byte limits as saved invoices', () => {
  assert.equal(getPromotionBillingFieldErrors({ ...base, address: 'a'.repeat(300) }).address, undefined);
  assert.equal(getPromotionBillingFieldErrors({ ...base, address: 'a'.repeat(301) }).address, 'feedback.fieldTooLong');
  assert.equal(getPromotionBillingFieldErrors({ ...base, city: 'ș'.repeat(51) }).city, 'feedback.fieldTooLong');
  assert.equal(getPromotionBillingFieldErrors({ ...base, registrationNumber: 'x'.repeat(65) }).registrationNumber, 'feedback.fieldTooLong');
});
test('saved promotional billing keeps verified company identity and normalizes CUI reuse', () => {
  const profile = { companyName: 'Verified Company', cui: 'RO 123456' }, saved = savedCompanyBilling(base, profile);
  assert.equal(saved.type, 'company'); assert.equal(saved.name, profile.companyName); assert.equal(saved.taxId, profile.cui);
  assert.equal(normalizedCUI(saved.taxId), normalizedCUI('123456'));
  assert.deepEqual(promotionBillingFromSaved(saved), base);
});
