import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutTotals } from '@packages/app-core/checkout/totals';
import { discountedUnitPrice } from '@packages/app-core/events/promoPrice';
import { calculateServiceFeeRon } from '@packages/app-core/events/serviceFee';

test('shared totals preserve the previous Web and Native calculations at rounding boundaries', () => {
  for (const price of [0, .01, .03, 1, 39.99, 50, 80, 150, 999.99]) for (const discount of [0, 1, 7, 23, 99, 100]) for (const absorbs of [false, true]) {
    const event = {ticketTypes:[{id:'a',priceRon:price},{id:'b',priceRon:23.17}],organizerAbsorbsServiceFee:absorbs};
    const quantities={a:3,b:2},result=checkoutTotals(event,quantities,discount);
    const subtotal=3*price+2*23.17,discounted=3*discountedUnitPrice(price,discount)+2*discountedUnitPrice(23.17,discount);
    const fee=absorbs?0:calculateServiceFeeRon(discounted,5,event);
    assert.deepEqual(result,{tickets:event.ticketTypes,count:5,subtotal,discount:subtotal-discounted,fee,total:discounted+fee});
  }
});
test('quotes retain ticket identity, ignore unselected tiers and do not mutate quantities', () => {
  const ticket={id:'a',priceRon:10},quantities=Object.freeze({a:1,b:0,foreign:4});
  const quote=checkoutTotals({ticketTypes:[ticket,{id:'b',priceRon:20}],commissionRateBps:0,commissionPerTicketBani:0},quantities);
  assert.equal(quote.tickets[0],ticket);assert.equal(quote.total,10);assert.equal(quote.count,1);
  assert.equal(checkoutTotals({ticketTypes:[]},{}).total,0);
});
