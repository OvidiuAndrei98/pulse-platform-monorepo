import test from 'node:test';
import assert from 'node:assert/strict';
import {changeTicketQuantity,initialTicketQuantities,isTicketSelectionAvailable,retainAvailableTickets,ticketQuantityLimit,ticketSelectionMode} from '../src/checkout/ticketAvailability';
import {checkoutTotals} from '../src/checkout/totals';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const now=Date.parse('2026-11-03T12:00:00Z');
const tier=(n:number,priceRon=50)=>({id:id(n),priceRon,capacity:100,ticketsSold:0,startSales:'2026-01-01T00:00:00Z',endSales:'2027-01-01T00:00:00Z'});
test('separate quantities add multiple tiers, decrement to zero and preserve other selections',()=>{
  const tickets=[tier(1),tier(2,100)];let selected:Record<string,number>={};
  for(const [ticket,value] of [[id(1),2],[id(2),3],[id(1),0]] as const)selected=changeTicketQuantity(tickets,selected,ticket,value,now);
  assert.deepEqual(selected,{[id(2)]:3});assert.equal(isTicketSelectionAvailable(tickets,selected,now),true);
});
test('per-type 8 and per-order 16 match API; inventory and sale windows also constrain plus',()=>{
  const tickets=[tier(1),tier(2),tier(3)];const selected={[id(1)]:8,[id(2)]:7};
  assert.equal(ticketQuantityLimit(tickets,selected,id(3),now),1);
  assert.equal(changeTicketQuantity(tickets,selected,id(3),2,now),selected);
  assert.equal(isTicketSelectionAvailable(tickets,{...selected,[id(3)]:2},now),false);
  assert.equal(isTicketSelectionAvailable(tickets,{[id(1)]:9},now),false);
  for(const ticket of [{...tier(1),ticketsSold:100},{...tier(1),endSales:'2026-01-01T00:00:00Z'},{...tier(1),startSales:'2026-12-01T00:00:00Z'}])assert.deepEqual(changeTicketQuantity([ticket],{},ticket.id,1,now),{});
  assert.equal(ticketQuantityLimit([{...tier(1),capacity:2}],{},id(1),now),2);
});
test('free reservations remain one personal ticket and cannot enter a mixed paid basket',()=>{
  const tickets=[tier(1,0),tier(2,0),tier(3)];
  assert.deepEqual(changeTicketQuantity(tickets,{[id(3)]:2},id(1),1,now),{[id(1)]:1});
  assert.deepEqual(changeTicketQuantity(tickets,{[id(1)]:1},id(2),1,now),{[id(2)]:1});
  assert.deepEqual(changeTicketQuantity(tickets,{[id(1)]:1},id(3),2,now),{[id(3)]:2});
  assert.deepEqual(changeTicketQuantity(tickets,{},id(1),2,now),{});
});
test('classifying refreshed prices rejects mixed or multi-free snapshots before paid checkout',()=>{
  const tickets=[tier(1,0),tier(2,0),tier(3)];
  assert.equal(ticketSelectionMode(tickets,{[id(3)]:2}),'paid');assert.equal(ticketSelectionMode(tickets,{[id(1)]:1}),'free');
  for(const selection of [{},{[id(1)]:1,[id(3)]:1},{[id(1)]:2},{[id(1)]:1,[id(2)]:1},{[id(9)]:1}])assert.equal(ticketSelectionMode(tickets,selection),'invalid');
});
test('expired or overstock selections are removed without clearing other valid tiers',()=>{
  const tickets=[{...tier(1),ticketsSold:100},tier(2),{...tier(3),capacity:1}];
  const selected={[id(1)]:1,[id(2)]:3,[id(3)]:2,[id(9)]:1};
  assert.deepEqual(retainAvailableTickets(tickets,selected,now),{[id(2)]:3});
  assert.equal(retainAvailableTickets(tickets,{[id(2)]:3},null)[id(2)],3);
});
test('route maps are copied and validated, with a legacy fallback only when the map is absent',()=>{
  const value={[id(1)]:2,[id(2)]:3,[id(3)]:0},parsed=initialTicketQuantities(value);value[id(1)]=8;
  assert.deepEqual(parsed,{[id(1)]:2,[id(2)]:3});assert.deepEqual(initialTicketQuantities(undefined,id(1)),{[id(1)]:1});
  for(const value of [null,[],false,{bad:1},{[id(1)]:9},{[id(1)]:-1},{[id(1)]:1.5},{[id(1)]:NaN},{[id(1)]:8,[id(2)]:8,[id(3)]:1}])assert.deepEqual(initialTicketQuantities(value,id(1)),{});
});
test('totals include every selected ticket and calculate fees once over the complete basket',()=>{
  const event={ticketTypes:[tier(1),tier(2,100)],commissionRateBps:500,commissionPerTicketBani:150};
  const totals=checkoutTotals(event,{[id(1)]:2,[id(2)]:1});
  assert.equal(totals.count,3);assert.equal(totals.subtotal,200);assert.equal(totals.fee,14.5);assert.equal(totals.total,214.5);
});
