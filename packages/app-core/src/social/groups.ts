import type {components} from '@packages/api-client/schema';
import {isOutingId,parsePlans,planningBoundary,type OutingsRequest,type OutingPlan,type PlanFriend,type PlanEvent} from '../outings/model';
import {shiftCalendarDay} from '../events/discoveryFilters';
export type FriendGroup=components['schemas']['FriendGroup'];
export type GroupMessage=components['schemas']['FriendGroupMessage'];
export type SharedEvent=components['schemas']['SharedGroupEvent'];
export type GroupAction=components['schemas']['FriendGroupAction'];
export type GroupOutingDraft=Omit<components['schemas']['CreateGroupOuting'],'requestId'>;
export const GROUP_MEMBER_LIMIT=8;
export function groupTicketLabel(state?:string){return ({unknown:'groups.ticket_unknown',none:'groups.ticket_none',processing:'groups.ticket_processing',offered:'groups.ticket_offered',valid:'groups.ticket_valid',used:'groups.ticket_used',expired:'groups.ticket_expired'} as Record<string,string>)[state??'unknown']??'groups.ticket_unknown'}
export function groupReadinessLabel(plan:OutingPlan,actor?:string){
 if(!plan.allConfirmedReady)return 'groups.summary';
 if(plan.confirmedCount===1)return plan.members.some(m=>m.userId===actor&&m.status==='accepted'&&m.attendance==='yes')?'groups.readyForYou':'groups.readyForOne';
 return 'groups.ready';
}
function mergeOutings(fresh:readonly OutingPlan[],previous:readonly OutingPlan[]){return [...new Map([...previous,...fresh].map(p=>[p.id,p])).values()].sort((a,b)=>(Date.parse(b.createdAt??'')||0)-(Date.parse(a.createdAt??'')||0))}
export type GroupsState={groups:FriendGroup[];messages:Record<string,GroupMessage[]>;more:Record<string,boolean>;drafts:Record<string,string>;collection:Record<string,GroupMessage[]>;collectionMore:Record<string,boolean>;historyMore:Record<string,boolean>;friends:PlanFriend[];events:PlanEvent[];catalogLoading:boolean;catalogMore:boolean;loading:boolean;busy:boolean;error:string|null;sendError:string|null;revoked:string[]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function bad():never{throw Error('INVALID_RESPONSE');}
export function parseGroups(value:unknown):FriendGroup[]{
 if(!Array.isArray(value)||value.length>100)bad();
 for(const g of value){if(!object(g)||!isOutingId(g.id)||!isOutingId(g.ownerId)||typeof g.name!=='string'||!['accepted','pending'].includes(String(g.status))||!Number.isSafeInteger(g.revision)||!Number.isSafeInteger(g.lastSeq)||!Number.isSafeInteger(g.unread)||!Array.isArray(g.members)||g.members.length>GROUP_MEMBER_LIMIT)bad();
  for(const m of g.members)if(!object(m)||!isOutingId(m.userId)||typeof m.username!=='string'||!['pending','accepted'].includes(String(m.status)))bad();
  parsePlans(g.outings);if(g.status==='pending'&&((g.outings as unknown[]).length||g.preview||g.unread))bad();
 }
 return value as FriendGroup[];
}
export function parseMessages(value:unknown){
 if(!object(value)||!Array.isArray(value.items)||value.items.length>50||typeof value.hasMore!=='boolean')bad();
 for(const m of value.items){if(!object(m)||!isOutingId(m.id)||!isOutingId(m.requestId)||!isOutingId(m.senderId)||!Number.isSafeInteger(m.seq)||typeof m.content!=='string'||!['text','event','outing'].includes(String(m.kind))||!Number.isFinite(Date.parse(String(m.createdAt))))bad();}
 return value as components['schemas']['GroupMessages'];
}
export function preferredGroupOuting(plans:readonly OutingPlan[],now=Date.now()){
 return plans.filter(p=>p.lifecycle!=='completed'&&p.lifecycle!=='cancelled').slice().sort((a,b)=>{
  const time=(p:OutingPlan)=>Date.parse(p.options.find(o=>o.eventId===p.chosenEventId)?.startTime??((p.outingDate??p.candidateDates?.[0]?.date)+'T06:00:00Z'))||Infinity;
  const live=(p:OutingPlan)=>time(p)<=now&&Date.parse(p.expiresAt)>now;
  return Number(live(b))-Number(live(a))||time(a)-time(b);
 })[0];
}
export function groupFailure(cause:unknown){
 const e=cause as {status?:number;code?:string};
 if(e.status===401)return 'groups.sessionEnded';if(e.status===403||e.status===404)return 'groups.accessLost';
 const codes=['FRIEND_UNAVAILABLE','GROUP_FULL','TRANSFER_ADMIN_FIRST','REQUEST_REUSED','OUTING_EXISTS','EVENT_UNAVAILABLE','PLAN_CHANGED','INVALID_PLAN_CONTEXT','PROPOSAL_LIMIT'];
 return codes.includes(e.code??'')?'groups.errors.'+e.code:'groups.failed';
}
export class GroupsStore{
 private state:GroupsState={groups:[],messages:{},more:{},drafts:{},collection:{},collectionMore:{},historyMore:{},friends:[],events:[],catalogLoading:false,catalogMore:false,loading:true,busy:false,error:null,sendError:null,revoked:[]};
 private listeners=new Set<()=>void>();private closed=false;private reads=new Set<string>();private refreshAgain=new Set<string>();private pending=new Set<AbortController>();private ids=new Map<string,string>();private version=0;private catalogSerial=0;private gaps=new Map<string,number>();private oldestMore=new Map<string,boolean>();private historyCursor=new Map<string,string>();
 private readTargets=new Map<string,number>();private readAcknowledged=new Map<string,number>();
 constructor(private request:OutingsRequest,private current:()=>boolean,private newId:()=>string){}
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}};
 getSnapshot=()=>this.state;
 private active(){return !this.closed&&this.current()}
 private set(patch:Partial<GroupsState>){if(!this.active()||Object.entries(patch).every(([key,value])=>this.state[key as keyof GroupsState]===value))return;this.state={...this.state,...patch};this.listeners.forEach(fn=>fn())}
 dispose(){this.closed=true;for(const r of this.pending)r.abort();this.pending.clear();this.ids.clear();this.gaps.clear();this.oldestMore.clear();this.historyCursor.clear();this.readTargets.clear();this.readAcknowledged.clear();this.state={...this.state,groups:[],messages:{},drafts:{},collection:{},friends:[],events:[]};this.listeners.forEach(fn=>fn());this.listeners.clear()}
 private async call<T>(path:string,method:'GET'|'POST'='GET',body?:unknown){const controller=new AbortController();this.pending.add(controller);try{return await this.request<T>(path,method,body,controller.signal)}finally{this.pending.delete(controller)}}
 private key(kind:string,payload:unknown){const s=kind+JSON.stringify(payload);let id=this.ids.get(s);if(!id){id=this.newId();this.ids.set(s,id)}return id}
 draft(id:string,text:string){this.set({drafts:{...this.state.drafts,[id]:text}})}
 private revoke(id:string){
  this.version++;this.gaps.delete(id);this.oldestMore.delete(id);this.historyCursor.delete(id);this.readTargets.delete(id);this.readAcknowledged.delete(id);
  for(const key of this.ids.keys())if(key.startsWith('message:'+id)||key.startsWith('outing:'+id))this.ids.delete(key);
  const messages={...this.state.messages},drafts={...this.state.drafts},collection={...this.state.collection},more={...this.state.more},collectionMore={...this.state.collectionMore},historyMore={...this.state.historyMore};
  delete messages[id];delete drafts[id];delete collection[id];delete more[id];delete collectionMore[id];delete historyMore[id];
  this.set({groups:this.state.groups.filter(g=>g.id!==id),messages,drafts,collection,more,collectionMore,historyMore,revoked:[...new Set([...this.state.revoked,id])]})
 }
 async load(id?:string){
  const scope=id??'list';if(!this.active())return;if(this.reads.has(scope)){this.refreshAgain.add(scope);return}this.reads.add(scope);const version=this.version;
  try{const data=await this.call<unknown>('/outings/groups'+(id?'/'+id:''));if(!this.active()||version!==this.version)return;
   const groups=parseGroups(id?[data]:data);
   for(const fresh of groups){const previous=this.state.groups.find(g=>g.id===fresh.id);if(previous&&(previous.status!==fresh.status||previous.joinedAt!==fresh.joinedAt||previous.visibleAfterSeq!==fresh.visibleAfterSeq))this.revoke(fresh.id)}
   if(!id){for(const old of this.state.groups)if(!groups.some(g=>g.id===old.id))this.revoke(old.id)}
   const hydrated=groups.map(g=>{const old=this.state.groups.find(p=>p.id===g.id);return g.status==='accepted'&&old?{...g,outings:mergeOutings(g.outings,old.outings)}:g});
   const next=id?(this.state.groups.some(g=>g.id===id)?this.state.groups.map(g=>g.id===id?hydrated[0]!:g):[...this.state.groups,...hydrated]):hydrated;
   const revoked=this.state.revoked.some(id=>groups.some(g=>g.id===id))?this.state.revoked.filter(id=>!groups.some(g=>g.id===id)):this.state.revoked;
   this.set({groups:JSON.stringify(next)===JSON.stringify(this.state.groups)?this.state.groups:next,loading:false,error:null,revoked});
   if(id&&groups[0]?.status==='accepted'){await this.loadMessages(id);const cursor=this.readTargets.get(id);if(cursor)void this.read(id,cursor)}
  }catch(e){if(!this.active()||version!==this.version)return;const status=(e as {status?:number}).status;if(id&&(status===403||status===404))this.revoke(id);this.set({loading:false,error:groupFailure(e)})}finally{this.reads.delete(scope);if(this.refreshAgain.delete(scope)&&this.active())void this.load(id)}
 }
 async loadMessages(id:string,older=false){
  if(!this.active()||this.reads.has('messages:'+id))return;const group=this.state.groups.find(g=>g.id===id);if(group?.status!=='accepted')return;
  this.reads.add('messages:'+id);const version=this.version,old=this.state.messages[id]??[],gap=older?this.gaps.get(id):undefined,before=older?gap??old.at(-1)?.seq:undefined;
  try{const data=parseMessages(await this.call('/outings/groups/'+id+'/messages'+(before?'?before='+before:'')));if(!this.active()||version!==this.version)return;
   // A membership change always invalidates local private history before merging.
   const boundary=this.state.groups.find(g=>g.id===id)?.visibleAfterSeq??0;
   const minimum=data.items.at(-1)?.seq;
   if(!older&&!old.length)this.oldestMore.set(id,data.hasMore);
   if(older&&!gap)this.oldestMore.set(id,data.hasMore);
   if(!older&&old.length&&minimum!==undefined&&minimum>old[0]!.seq+1)this.gaps.set(id,minimum);
   if(gap&&minimum!==undefined){const nextKnown=old.find(m=>m.seq<gap)?.seq??boundary;if(minimum>nextKnown+1)this.gaps.set(id,minimum);else this.gaps.delete(id)}
   const messages=[...new Map([...(older?old:old.filter(m=>m.seq<(data.items.at(-1)?.seq??Infinity))),...data.items].filter(m=>m.seq>boundary).map(m=>[m.id,m])).values()].sort((a,b)=>b.seq-a.seq);
   const more=this.gaps.has(id)||(this.oldestMore.get(id)??data.hasMore);
   this.set({messages:JSON.stringify(messages)===JSON.stringify(this.state.messages[id])?this.state.messages:{...this.state.messages,[id]:messages},more:this.state.more[id]===more?this.state.more:{...this.state.more,[id]:more}});
  }catch(e){if(!this.active()||version!==this.version)return;if([403,404].includes((e as {status?:number}).status??0))this.revoke(id);this.set({error:groupFailure(e)})}finally{this.reads.delete('messages:'+id)}
 }
 async collection(id:string,older=false){
  if(!this.active()||this.reads.has('collection:'+id))return;this.reads.add('collection:'+id);const version=this.version,old=this.state.collection[id]??[],before=older?old.at(-1)?.seq:undefined;
  try{const data=parseMessages(await this.call('/outings/groups/'+id+'/messages?collection=events'+(before?'&before='+before:'')));if(!this.active()||version!==this.version)return;
   const boundary=this.state.groups.find(g=>g.id===id)?.visibleAfterSeq??0;
   const all=(older?[...old,...data.items]:data.items).filter(m=>m.seq>boundary);this.set({collection:{...this.state.collection,[id]:all},collectionMore:{...this.state.collectionMore,[id]:data.hasMore}})
  }catch(e){if(!this.active()||version!==this.version)return;if([403,404].includes((e as {status?:number}).status??0))this.revoke(id);this.set({error:groupFailure(e)})}finally{this.reads.delete('collection:'+id)}
 }
 async loadPlan(groupId:string,planId:string){
  if(!this.active()||this.reads.has('plan:'+planId))return;this.reads.add('plan:'+planId);const version=this.version;
  try{const plan=parsePlans([await this.call('/outings/plans/'+planId)])[0]!;if(!this.active()||version!==this.version)return;if(plan.groupId!==groupId)bad();this.set({groups:this.state.groups.map(g=>g.id===groupId?{...g,outings:mergeOutings([plan],g.outings)}:g)})}
  catch(e){if(this.active()&&version===this.version)this.set({error:groupFailure(e)})}finally{this.reads.delete('plan:'+planId)}
 }
 async loadHistory(id:string,older=false){
  if(!this.active()||this.reads.has('history:'+id))return;this.reads.add('history:'+id);const version=this.version;
  const before=older?this.historyCursor.get(id):undefined;
  try{const data=await this.call<{items:OutingPlan[];hasMore:boolean}>('/outings/groups/'+id+'/outings'+(before?'?before='+before:''));const plans=parsePlans(data.items);if(typeof data.hasMore!=='boolean'||plans.some(p=>p.groupId!==id))bad();if(!this.active()||version!==this.version)return;
   if(plans.length)this.historyCursor.set(id,plans.at(-1)!.id);
   this.set({groups:this.state.groups.map(g=>g.id===id?{...g,outings:mergeOutings(plans,g.outings)}:g),historyMore:{...this.state.historyMore,[id]:data.hasMore}})
  }catch(e){if(this.active()&&version===this.version)this.set({error:groupFailure(e)})}finally{this.reads.delete('history:'+id)}
 }
 async catalog(query='',context?:{date?:string;city?:string},page=1){
  if(!this.active())return;this.set({catalogLoading:true});const version=this.version,serial=++this.catalogSerial;try{
   const params=new URLSearchParams({q:query,page:String(page)});if(context?.city)params.set('city',context.city);
   if(context?.date){params.set('startsAfter',planningBoundary(context.date));params.set('startsBefore',planningBoundary(shiftCalendarDay(context.date,1)))}
   const [events,friends]=await Promise.all([this.call<PlanEvent[]>('/events?'+params),this.call<PlanFriend[]>('/friends')]);
   if(!this.active()||version!==this.version||serial!==this.catalogSerial)return;this.set({events:page===1?events:[...new Map([...this.state.events,...events].map(e=>[e.id,e])).values()],friends,catalogMore:events.length>=20,error:null});
  }catch(e){if(serial===this.catalogSerial)this.set({error:groupFailure(e)})}finally{if(serial===this.catalogSerial)this.set({catalogLoading:false})}
 }
 private async mutate<T>(path:string,payload:unknown,group?:string):Promise<T|undefined>{
  if(!this.active()||this.state.busy)return;this.version++;this.set({busy:true,error:null});try{
   const value=await this.call<T>(path,'POST',payload);if(!this.active())return;await this.load(group);return value;
  }catch(e){if(group&&[403,404].includes((e as {status?:number}).status??0))this.revoke(group);this.set({error:groupFailure(e)});return undefined}finally{this.set({busy:false})}
 }
 async create(name:string,friendIds:string[],eventId?:string){const body={name:name.trim(),friendIds,...(eventId?{eventId}:{})};const result=await this.mutate<FriendGroup>('/outings/groups',{...body,requestId:this.key('group',body)});if(result){parseGroups([result]);this.set({groups:this.state.groups.some(g=>g.id===result.id)?this.state.groups.map(g=>g.id===result.id?result:g):[result,...this.state.groups]})}return result}
 async action(id:string,payload:GroupAction){const result=await this.mutate('/outings/groups/'+id+'/actions',payload,['leave','decline'].includes(payload.action)?undefined:id);if(result&&['leave','decline'].includes(payload.action))this.revoke(id);return result}
 async send(id:string,eventId?:string){
  const content=eventId?'':this.state.drafts[id]??'',body={content,eventId};if(!content.trim()&&!eventId)return;if(!this.active()||this.state.busy)return;
  const requestId=this.key('message:'+id,body);this.set({sendError:null});const result=await this.mutate('/outings/groups/'+id+'/messages',{...body,requestId},id);
  if(result){this.ids.delete('message:'+id+JSON.stringify(body));if(!eventId&&this.state.drafts[id]===content)this.draft(id,'')}
  else this.set({sendError:'groups.messageFailed'});return result;
 }
 createOuting(id:string,draft:GroupOutingDraft){return this.mutate<OutingPlan>('/outings/groups/'+id+'/outings',{...draft,requestId:this.key('outing:'+id,draft)},id)}
 planAction(group:string,plan:string,action:string,payload:unknown){return this.mutate('/outings/plans/'+plan+'/'+action,payload,group)}
 async read(id:string,seq:number):Promise<boolean>{
  if(!this.active()||this.state.groups.find(g=>g.id===id)?.status!=='accepted'||!Number.isSafeInteger(seq)||seq<=0)return false;
  this.readTargets.set(id,Math.max(seq,this.readTargets.get(id)??0));
  if((this.readAcknowledged.get(id)??0)>=seq)return true;
  const scope='read:'+id;if(this.reads.has(scope))return false;this.reads.add(scope);
  const target=this.readTargets.get(id)!,version=this.version;let acknowledged=false;
  try{await this.call('/outings/groups/'+id+'/actions','POST',{action:'read',seq:target});if(this.active()&&version===this.version){this.readAcknowledged.set(id,target);acknowledged=true}}
  catch{/* Keep the desired cursor; the next focused group poll retries it. */}
  finally{this.reads.delete(scope);if(acknowledged&&(this.readTargets.get(id)??0)>target)void this.read(id,this.readTargets.get(id)!)}
  return acknowledged;
 }
}
