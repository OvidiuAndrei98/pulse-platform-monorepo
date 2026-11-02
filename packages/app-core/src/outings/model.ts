import { eventCities } from '../events/constants';
import { productToday, productMidnight, shiftCalendarDay, validCalendarDay } from '../events/discoveryFilters';
import type { components } from '@packages/api-client/schema';

export type OutingPlan = components['schemas']['OutingPlan'];
export type TicketTransfer = components['schemas']['TicketTransfer'];
export type PlanDraft = components['schemas']['CreateOutingPlan'];
export type PlanEvent = { id: string; title: string; startTime: string; endTime: string; locationName: string; city: string };
export type PlanFriend = { id: string; username: string };
export type OutingsRequest = <T>(path: string, method: 'GET' | 'POST', body?: unknown, signal?: AbortSignal) => Promise<T>;
export type OutingsState = {
  plans: OutingPlan[]; transfers: TicketTransfer[];
  events: PlanEvent[]; friends: PlanFriend[]; catalogPending: boolean; moreEvents: boolean;
  pending: boolean; refreshing: boolean; working: boolean; error: string | null; notice: string | null;
};
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isOutingId = (value: unknown): value is string => typeof value === 'string' && idPattern.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
function invalid(): never { throw new Error('INVALID_RESPONSE'); }
export function parsePlans(value: unknown): OutingPlan[] {
  if (!Array.isArray(value)) return invalid();
  for (const p of value) {
    if (!record(p) || !isOutingId(p.id) || !isOutingId(p.ownerId) || typeof p.title !== 'string' || !date(p.expiresAt) || !['pending', 'accepted'].includes(String(p.status)) ||
      p.chosenEventId !== undefined && !isOutingId(p.chosenEventId) || !Array.isArray(p.members) || !Array.isArray(p.options)) return invalid();
    if(p.outingDate!==undefined&&!validCalendarDay(p.outingDate)||p.city!==undefined&&(typeof p.city!=='string'||p.city.length>80))return invalid();
    for (const m of p.members) if (!record(m) || !isOutingId(m.userId) || typeof m.username !== 'string' || !['pending', 'accepted'].includes(String(m.status)) || m.voteEventId !== undefined && !isOutingId(m.voteEventId) || m.hasTicket!==undefined&&typeof m.hasTicket!=='boolean') return invalid();
    for (const o of p.options) if (!record(o) || !isOutingId(o.eventId) || typeof o.title !== 'string' || typeof o.location !== 'string' || !date(o.startTime) || typeof o.available !== 'boolean' ||
      o.proposedBy!==undefined&&!isOutingId(o.proposedBy)||o.priceRon!==undefined&&(typeof o.priceRon!=='number'||!Number.isFinite(o.priceRon)||o.priceRon<0)||
      o.ticketAvailability!==undefined&&!['on_sale','upcoming','sold_out','sales_ended','external','unavailable'].includes(String(o.ticketAvailability))) return invalid();
  }
  return value as OutingPlan[];
}
export function parseTransfers(value: unknown): TicketTransfer[] {
  if (!Array.isArray(value)) return invalid();
  for (const t of value) if (!record(t) || ![t.id,t.ticketId,t.eventId,t.senderId].every(isOutingId) ||
    t.recipientId !== '' && !isOutingId(t.recipientId) || typeof t.eventTitle !== 'string' || typeof t.senderName !== 'string' || typeof t.recipientName !== 'string' || !date(t.expiresAt) ||
    !['pending','accepted','declined','cancelled','expired'].includes(String(t.status))) return invalid();
  return value as TicketTransfer[];
}
export function planVoteCount(plan: OutingPlan, eventId: string): number {
  return plan.members.filter(m => m.status === 'accepted' && m.voteEventId === eventId).length;
}
export { productToday as planningToday };
export function validPlanningDate(value: string, now=new Date()): boolean {
  const today=productToday(now);
  return validCalendarDay(value)&&value>=today&&value<=shiftCalendarDay(today,365);
}
export function canCreatePlan(title:string,day:string,city:string,friends:readonly string[]):boolean {
  return !!title.trim()&&Array.from(title.trim()).length<=80&&validPlanningDate(day)&&eventCities.includes(city)&&
    friends.length>=1&&friends.length<=7&&new Set(friends).size===friends.length&&friends.every(isOutingId);
}
export function matchesPlanningContext(event:PlanEvent,context:{outingDate?:string;city?:string}) {
  return !!context.outingDate&&event.city.toLowerCase()===context.city?.toLowerCase()&&productToday(new Date(event.startTime))===context.outingDate;
}
export function canOfferTransfer(ticket: {isValidated: boolean; startTime: string; endTime: string}, now = Date.now()): boolean {
  return !ticket.isValidated && Date.parse(ticket.startTime) > now && Date.parse(ticket.endTime) > now;
}
export function eventNightTickets<T extends {eventId: string; endTime: string}>(tickets: readonly T[], eventId: string, now=Date.now()): T[] {
  return tickets.filter(t => t.eventId === eventId && Date.parse(t.endTime)>now);
}
export function outingFailure(cause: unknown): string {
  const value = cause as {code?: string; message?: string; status?: number};
  if (value?.status === 401 || value?.status === 403) return 'outings.sessionEnded';
  const code = `${value?.code ?? ''} ${value?.message ?? ''}`;
  for (const key of ['TRANSFER_WINDOW_CLOSED','TRANSFER_PENDING','TRANSFER_CLOSED','TICKET_NOT_TRANSFERABLE','RECIPIENT_UNAVAILABLE','REQUEST_REUSED','EVENT_UNAVAILABLE','PLAN_DECIDED','INVITATION_CLOSED','FRIEND_UNAVAILABLE','INVALID_PLAN_CONTEXT','PROPOSAL_LIMIT']) {
    if (code.includes(key)) return 'outings.errors.' + key;
  }
  return 'outings.failed';
}

/** Account-scoped, request-injected coordinator. Platform hooks own visibility. */
export class OutingsStore {
  private state: OutingsState = {plans:[],transfers:[],events:[],friends:[],catalogPending:false,moreEvents:false,pending:true,refreshing:false,working:false,error:null,notice:null};
  private listeners = new Set<() => void>();
  private read?: AbortController;
  private write?: AbortController;
  private catalog?: AbortController;
  private disposed = false;
  private revision = 0;
  private keys = new Map<string,string>();
  constructor(private request: OutingsRequest, private current: () => boolean, private newId: () => string, private scope:'plans'|'transfers'|'all'='all') {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {this.listeners.add(listener);return () => {this.listeners.delete(listener);};};
  private publish(patch: Partial<OutingsState>) { if(this.disposed || !this.current())return;this.state={...this.state,...patch};this.listeners.forEach(fn=>fn()); }
  private active = () => !this.disposed && this.current();
  activate() {this.disposed=false;this.publish({working:false,refreshing:false,catalogPending:false});}
  async searchEvents(query='',page=1,context?:{outingDate?:string;city?:string}) {
    if(!this.active())return;
    this.catalog?.abort();const request=this.catalog=new AbortController();this.publish({catalogPending:true});
    const params=new URLSearchParams({q:query.trim().slice(0,120),page:String(page)});
    if(context?.city)params.set('city',context.city);
    if(context?.outingDate&&validCalendarDay(context.outingDate)){
      params.set('startsAfter',productMidnight(context.outingDate));
      params.set('startsBefore',productMidnight(shiftCalendarDay(context.outingDate,1)));
    }
    try {
      const [events,friends]=await Promise.all([
        this.request<unknown>('/events?'+params.toString(),'GET',undefined,request.signal),
        this.request<unknown>('/friends','GET',undefined,request.signal),
      ]);
      if(!this.active()||request.signal.aborted)return;
      if(!Array.isArray(events)||!Array.isArray(friends))return invalid();
      const options=events.filter((e):e is PlanEvent => record(e)&&isOutingId(e.id)&&typeof e.title==='string'&&typeof e.locationName==='string'&&typeof e.city==='string'&&date(e.startTime)&&date(e.endTime)&&Date.parse(e.endTime as string)>Date.now());
      const people=friends.filter((f):f is PlanFriend=>record(f)&&isOutingId(f.id)&&typeof f.username==='string');
      this.publish({events:page===1?options:[...new Map([...this.state.events,...options].map(e=>[e.id,e])).values()],friends:people,moreEvents:events.length>0});
    }catch(cause){if(this.active()&&!request.signal.aborted)this.publish({error:outingFailure(cause)});}
    finally{if(this.catalog===request){this.catalog=undefined;this.publish({catalogPending:false});}}
  }
  async load(quiet=false): Promise<void> {
    if (!this.active() || this.read) return;
    const request = this.read = new AbortController(), version=this.revision;
    if(!quiet)this.publish({refreshing:true});
    try {
      const [plans,transfers]=await Promise.all([
        this.scope==='transfers'?Promise.resolve(this.state.plans):this.request<unknown>('/outings/plans','GET',undefined,request.signal),
        this.scope==='plans'?Promise.resolve(this.state.transfers):this.request<unknown>('/outings/transfers','GET',undefined,request.signal),
      ]);
      if(this.active() && version===this.revision && !request.signal.aborted)this.publish({plans:parsePlans(plans),transfers:parseTransfers(transfers),error:null,pending:false});
    } catch(cause) {if(this.active()&&!request.signal.aborted&&version===this.revision)this.publish({error:outingFailure(cause),pending:false});}
    finally {if(this.read===request){this.read=undefined;this.publish({refreshing:false});}}
  }
  /** Stable across an uncertain retry; changing the draft creates a different key. */
  requestId(kind: string, payload: unknown): string {
    const fingerprint=kind+':'+JSON.stringify(payload);let id=this.keys.get(fingerprint);
    if(!id){id=this.newId();this.keys.set(fingerprint,id);}return id;
  }
  createPlan(draft: Omit<PlanDraft,'requestId'>) {
    if(!canCreatePlan(draft.title,draft.outingDate,draft.city,draft.friendIds))return Promise.resolve(undefined);
    return this.mutate<OutingPlan>('/outings/plans',{...draft,requestId:this.requestId('plan',draft)});
  }
  propose(id:string,eventId:string) {return isOutingId(id)&&isOutingId(eventId)?this.mutate('/outings/plans/'+id+'/proposals',{eventId}):Promise.resolve(undefined);}
  async loadPlan(id:string) {
    if(!this.active()||!isOutingId(id)||this.write)return;
    const version=this.revision;
    try {
      const result=await this.request<unknown>('/outings/plans/'+id,'GET');
      if(this.active()&&version===this.revision){const [plan]=parsePlans([result]);this.publish({plans:[plan!,...this.state.plans.filter(p=>p.id!==id)]});}
    }catch(cause){if(this.active()&&version===this.revision)this.publish({error:outingFailure(cause)});}
  }
  respondPlan(id:string,status:'accepted'|'declined') {return isOutingId(id)?this.mutate('/outings/plans/'+id+'/respond',{status}):Promise.resolve(undefined);}
  vote(id:string,eventId:string) {return isOutingId(id)&&isOutingId(eventId)?this.mutate('/outings/plans/'+id+'/vote',{eventId}):Promise.resolve(undefined);}
  choose(id:string,eventId:string) {return isOutingId(id)&&isOutingId(eventId)?this.mutate('/outings/plans/'+id+'/choose',{eventId}):Promise.resolve(undefined);}
  createTransfer(ticketId:string,recipientEmail:string) {
    if(!isOutingId(ticketId))return Promise.resolve(undefined);
    const draft={ticketId,recipientEmail:recipientEmail.trim().toLowerCase()};
    return this.mutate<TicketTransfer>('/outings/transfers',{...draft,requestId:this.requestId('transfer',draft)});
  }
  respondTransfer(id:string,status:'accepted'|'declined'|'cancelled') {return isOutingId(id)?this.mutate('/outings/transfers/'+id+'/respond',{status}):Promise.resolve(undefined);}
  async mutate<T>(path: string, body: unknown): Promise<T | undefined> {
    if(!this.active()||this.write)return undefined;
    this.read?.abort();this.read=undefined;this.revision++;
    const request=this.write=new AbortController();this.publish({working:true,error:null,notice:null,refreshing:false});
    try {
      const value=await this.request<T>(path,'POST',body,request.signal);
      if(!this.active()||request.signal.aborted)return undefined;
      this.publish({notice:'outings.saved'});
      await this.load(true);
      return this.active()?value:undefined;
    } catch(cause){if(this.active()&&!request.signal.aborted)this.publish({error:outingFailure(cause)});return undefined;}
    finally{if(this.write===request){this.write=undefined;this.publish({working:false});}}
  }
  dispose() {this.disposed=true;this.revision++;this.read?.abort();this.write?.abort();this.catalog?.abort();this.read=undefined;this.write=undefined;this.catalog=undefined;this.keys.clear();this.listeners.clear();}
}
