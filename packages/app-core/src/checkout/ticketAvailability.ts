import type { ReadableSchema } from "@packages/api-client/schema-types";
type TicketTier = Pick<ReadableSchema<"TicketTypeResponse">, "id" | "capacity" | "ticketsSold" | "startSales" | "endSales">;
type SelectableTicket = TicketTier & {priceRon:number};
export const MAX_TICKETS_PER_TYPE = 8;
export const MAX_TICKETS_PER_ORDER = 16;
export function ticketSelectionMode(tickets:readonly SelectableTicket[],quantities:Record<string,number>):'paid'|'free'|'invalid' {
  const entries=Object.entries(quantities);
  if(entries.some(([,n])=>!Number.isSafeInteger(n)||n<0||n>MAX_TICKETS_PER_TYPE)||entries.reduce((sum,[,n])=>sum+n,0)>MAX_TICKETS_PER_ORDER)return 'invalid';
  const selected=entries.filter(([,n])=>n>0).map(([id,n])=>({ticket:tickets.find(ticket=>ticket.id===id),quantity:n}));
  if(!selected.length||selected.some(row=>!row.ticket||!Number.isFinite(row.ticket.priceRon)||row.ticket.priceRon<0))return 'invalid';
  if(selected.every(row=>row.ticket!.priceRon>0))return 'paid';
  return selected.length===1&&selected[0]!.quantity===1&&selected[0]!.ticket!.priceRon===0?'free':'invalid';
}

/** Individual free bookings and paid baskets use different server endpoints. */
export function ticketQuantityLimit(tickets:readonly SelectableTicket[],quantities:Record<string,number>,id:string,nowMs:number|null) {
  const ticket=tickets.find(ticket=>ticket.id===id);
  if(!ticket||getTicketAvailability(ticket,nowMs)!=='available')return 0;
  if(ticket.priceRon===0)return 1;
  const others=tickets.reduce((sum,tier)=>sum+(tier.id!==id&&tier.priceRon>0?(quantities[tier.id]??0):0),0);
  return Math.max(0,Math.min(MAX_TICKETS_PER_TYPE,getRemainingTicketCapacity(ticket),MAX_TICKETS_PER_ORDER-others));
}
export function changeTicketQuantity(tickets:readonly SelectableTicket[],quantities:Record<string,number>,id:string,value:number,nowMs:number|null=Date.now()):Record<string,number> {
  if(!Number.isSafeInteger(value)||value<0)return quantities;
  const ticket=tickets.find(ticket=>ticket.id===id);if(!ticket)return quantities;
  if(value===0){const next={...quantities};delete next[id];return next;}
  if(value>ticketQuantityLimit(tickets,quantities,id,nowMs))return quantities;
  if(ticket.priceRon===0)return {[id]:1};
  const next={...quantities};for(const tier of tickets)if(tier.priceRon===0)delete next[tier.id];
  return {...next,[id]:value};
}
export function retainAvailableTickets(tickets:readonly TicketTier[],quantities:Record<string,number>,nowMs:number|null) {
  if(nowMs===null)return quantities;
  const next=Object.fromEntries(Object.entries(quantities).filter(([id,quantity])=>{
    const ticket=tickets.find(ticket=>ticket.id===id);
    return quantity>0&&Number.isSafeInteger(quantity)&&quantity<=MAX_TICKETS_PER_TYPE&&!!ticket&&getTicketAvailability(ticket,nowMs)==='available'&&quantity<=getRemainingTicketCapacity(ticket);
  }));
  return Object.keys(next).length===Object.keys(quantities).length?quantities:next;
}
/** Navigation params are untrusted; reject invalid baskets instead of resizing them. */
export function initialTicketQuantities(value:unknown,legacyTicketId?:string):Record<string,number> {
  const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  if(value===undefined)return uuid(legacyTicketId)?{[legacyTicketId]:1}:{};
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const entries=Object.entries(value);if(entries.length>MAX_TICKETS_PER_ORDER)return {};
  let total=0;const next:Record<string,number>={};
  for(const [id,quantity] of entries){
    if(!uuid(id)||typeof quantity!=='number'||!Number.isSafeInteger(quantity)||quantity<0||quantity>MAX_TICKETS_PER_TYPE)return {};
    total+=quantity;if(total>MAX_TICKETS_PER_ORDER)return {};if(quantity>0)next[id]=quantity;
  }
  return next;
}

export type TicketAvailability =
  | "checking"
  | "available"
  | "sold-out"
  | "sales-ended"
  | "sales-not-started";

export function getTicketAvailability(
  ticket: TicketTier,
  nowMs: number | null,
): TicketAvailability {
  if (!Number.isFinite(ticket.capacity) || ticket.capacity <= 0 ||
      !Number.isFinite(ticket.ticketsSold ?? 0) || (ticket.ticketsSold ?? 0) < 0 ||
      (ticket.ticketsSold ?? 0) >= ticket.capacity) {
    return "sold-out";
  }
  if (nowMs === null) {
    return "checking";
  }

  const salesStartMs = Date.parse(ticket.startSales);
  const salesEndMs = Date.parse(ticket.endSales);
  if (!Number.isFinite(nowMs) || !Number.isFinite(salesStartMs) || !Number.isFinite(salesEndMs) || salesEndMs <= salesStartMs) {
    return "sales-ended";
  }
  if (nowMs < salesStartMs) {
    return "sales-not-started";
  }
  if (nowMs >= salesEndMs) {
    return "sales-ended";
  }
  return "available";
}

export function getRemainingTicketCapacity(ticket: TicketTier): number {
  return Math.max(0, ticket.capacity - (ticket.ticketsSold ?? 0));
}

export function isTicketSelectionAvailable(
  tickets: readonly TicketTier[],
  quantities: Record<string, number>,
  nowMs = Date.now(),
): boolean {
  const ticketsById = new Map(tickets.map((ticket) => [ticket.id, ticket]));
  if (Object.values(quantities).some((quantity) => !Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_TICKETS_PER_TYPE) || Object.values(quantities).reduce((sum,n)=>sum+n,0)>MAX_TICKETS_PER_ORDER) return false;
  const selected = Object.entries(quantities).filter(([, quantity]) => quantity > 0);
  return selected.length > 0 && selected.every(([ticketId, quantity]) => {
    const ticket = ticketsById.get(ticketId);
    return Boolean(
      ticket &&
      getTicketAvailability(ticket, nowMs) === "available" &&
      quantity <= getRemainingTicketCapacity(ticket),
    );
  });
}

