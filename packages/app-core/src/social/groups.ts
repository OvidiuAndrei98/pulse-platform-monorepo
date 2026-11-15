import type {components} from '@packages/api-client/schema';
import {validCalendarDay} from '../events/discoveryFilters';
import {canonicalPlanningCity,planningCityKey,isOutingId,parsePlans,type OutingsRequest,type OutingPlan,type PlanFriend,type PlanEvent} from '../outings/model';
export type FriendGroup=components['schemas']['FriendGroup'];
export type GroupMessage=components['schemas']['FriendGroupMessage'];
export type SharedEvent=components['schemas']['SharedGroupEvent'];
export type GroupAction=components['schemas']['FriendGroupAction'];
export type GroupOutingDraft=Omit<components['schemas']['CreateGroupOuting'],'requestId'>;
export type OutingContextDraft=components['schemas']['UpdateOutingContext'];
export type OutingContextImpact=components['schemas']['OutingContextImpact'];
export type GroupActionOptions={feedback?:'inline'};
export class GroupActionError extends Error{
 constructor(readonly key:string){super(key);this.name='GroupActionError'}
}
export const GROUP_MEMBER_LIMIT=8;
export function groupMembershipCounts(group:FriendGroup){return {accepted:group.members.filter(m=>m.status==='accepted').length,pending:group.members.filter(m=>m.status==='pending').length}}
export function findMatchingFriendGroup(groups:readonly FriendGroup[],actor:string|undefined,friendIds:readonly string[]){
 if(!isOutingId(actor)||!friendIds.length||!friendIds.every(isOutingId))return undefined;
 const actorKey=actor.toLowerCase(),friends=friendIds.map(id=>id.toLowerCase());if(friends.includes(actorKey)||new Set(friends).size!==friends.length)return undefined;
 const intended=new Set([actorKey,...friends]);
 return groups.find(group=>{const roster=group.members.filter(m=>m.status==='accepted'||m.status==='pending'),identities=roster.map(m=>m.userId.toLowerCase());return group.status==='accepted'&&roster.some(m=>m.userId.toLowerCase()===actorKey&&m.status==='accepted')&&roster.length===intended.size&&new Set(identities).size===roster.length&&identities.every(id=>intended.has(id))});
}
export function groupCatalogKey(query='',context?:{date?:string;city?:string}){return JSON.stringify([query.trim(),context?.date??'',planningCityKey(context?.city)])}
export function groupTicketLabel(state?:string){return ({unknown:'groups.ticket_unknown',none:'groups.ticket_none',processing:'groups.ticket_processing',offered:'groups.ticket_offered',valid:'groups.ticket_valid',used:'groups.ticket_used',expired:'groups.ticket_expired'} as Record<string,string>)[state??'unknown']??'groups.ticket_unknown'}
export function groupReadinessLabel(plan:OutingPlan,actor?:string){
 if(!plan.allConfirmedReady)return 'groups.summary';
 if(plan.confirmedCount===1)return plan.members.some(m=>m.userId===actor&&m.status==='accepted'&&m.attendance==='yes')?'groups.readyForYou':'groups.readyForOne';
 return 'groups.ready';
}
function mergeOutings(fresh:readonly OutingPlan[],previous:readonly OutingPlan[]){const plans=new Map(previous.map(p=>[p.id,p]));for(const plan of fresh){const old=plans.get(plan.id);if(!old||(plan.revision??0)>=(old.revision??0))plans.set(plan.id,plan)}return [...plans.values()].sort((a,b)=>(Date.parse(b.createdAt??'')||0)-(Date.parse(a.createdAt??'')||0))}
function activityFraction(value:string){return Number((value.match(/\.(\d+)/)?.[1]??'').slice(3).padEnd(6,'0'))}
function orderGroups(groups:FriendGroup[]){return groups.every(g=>Number.isFinite(Date.parse(g.activityAt??'')))?groups.slice().sort((a,b)=>Date.parse(b.activityAt!)-Date.parse(a.activityAt!)||activityFraction(b.activityAt!)-activityFraction(a.activityAt!)||a.id.localeCompare(b.id)):groups}
export type GroupLoadStatus='idle'|'loading'|'success'|'error';
export type GroupsState={groups:FriendGroup[];messages:Record<string,GroupMessage[]>;more:Record<string,boolean>;drafts:Record<string,string>;collection:Record<string,GroupMessage[]>;collectionMore:Record<string,boolean>;historyMore:Record<string,boolean>;collectionStatus:Record<string,GroupLoadStatus>;collectionError:Record<string,string|null>;historyStatus:Record<string,GroupLoadStatus>;historyError:Record<string,string|null>;friends:PlanFriend[];friendsLoading:boolean;friendsError:string|null;events:PlanEvent[];catalogKey:string;catalogStatus:'idle'|'loading'|'success'|'error';catalogError:string|null;catalogLoading:boolean;catalogMore:boolean;contextImpact:OutingContextImpact|null;contextConflict:string|null;contextError:string|null;loading:boolean;busy:boolean;error:string|null;sendError:string|null;revoked:string[]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function bad():never{throw Error('INVALID_RESPONSE');}
export function parseGroups(value:unknown):FriendGroup[]{
 if(!Array.isArray(value)||value.length>100)bad();
 for(const g of value){if(!object(g)||!isOutingId(g.id)||!isOutingId(g.ownerId)||typeof g.name!=='string'||!['accepted','pending'].includes(String(g.status))||!Number.isSafeInteger(g.revision)||!Number.isSafeInteger(g.lastSeq)||!Number.isSafeInteger(g.unread)||!Array.isArray(g.members)||g.members.length>GROUP_MEMBER_LIMIT)bad();
  for(const m of g.members)if(!object(m)||!isOutingId(m.userId)||typeof m.username!=='string'||!['pending','accepted'].includes(String(m.status)))bad();
  parsePlans(g.outings);if(g.activityAt!==undefined&&(typeof g.activityAt!=='string'||!Number.isFinite(Date.parse(g.activityAt))))bad();
  if(g.preview!==undefined&&typeof g.preview!=='string'||g.previewKind!==undefined&&!['text','event','outing'].includes(String(g.previewKind))||g.previewAuthor!==undefined&&typeof g.previewAuthor!=='string'||g.previewDate!==undefined&&!validCalendarDay(g.previewDate))bad();
  if(g.status==='pending'&&((g.outings as unknown[]).length||g.preview||g.previewKind||g.previewAuthor||g.previewDate||g.unread))bad();
 }
 return value as FriendGroup[];
}
export function parseMessages(value:unknown){
 if(!object(value)||!Array.isArray(value.items)||value.items.length>50||typeof value.hasMore!=='boolean')bad();
 for(const m of value.items){if(!object(m)||!isOutingId(m.id)||!isOutingId(m.requestId)||!isOutingId(m.senderId)||!Number.isSafeInteger(m.seq)||typeof m.content!=='string'||!['text','event','outing'].includes(String(m.kind))||!Number.isFinite(Date.parse(String(m.createdAt))))bad();
  if(m.outingContext!==undefined){const c=m.outingContext;
   if(m.kind!=='outing'||!isOutingId(m.outingId)||!object(c)||!Number.isSafeInteger(c.decisionRound)||Number(c.decisionRound)<1||typeof c.title!=='string'||typeof c.city!=='string'||!Array.isArray(c.candidateDates)||c.candidateDates.length>3||!c.candidateDates.every(validCalendarDay)||new Set(c.candidateDates).size!==c.candidateDates.length||c.outingDate!==undefined&&!validCalendarDay(c.outingDate)||c.chosenEventId!==undefined&&!isOutingId(c.chosenEventId))bad();
  }
 }
 return value as components['schemas']['GroupMessages'];
}
export function preferredGroupOuting(plans:readonly OutingPlan[],now=Date.now()){
 return plans.filter(p=>p.lifecycle!=='completed'&&p.lifecycle!=='cancelled').slice().sort((a,b)=>{
  const time=(p:OutingPlan)=>Date.parse(p.options.find(o=>o.eventId===p.chosenEventId)?.startTime??((p.outingDate??p.candidateDates?.[0]?.date)+'T06:00:00Z'))||Infinity;
  const live=(p:OutingPlan)=>time(p)<=now&&Date.parse(p.expiresAt)>now;
  return Number(live(b))-Number(live(a))||time(a)-time(b);
 })[0];
}
function groupErrorCode(cause:unknown){const e=(cause??{}) as {code?:string;title?:string;data?:{code?:string;error?:string}};return e.code??e.data?.code??e.data?.error??e.title}
export function groupFailure(cause:unknown){
 const e=(cause??{}) as {status?:number};const code=groupErrorCode(cause);
 if(e.status===401)return 'groups.sessionEnded';if(code==='OUTING_EDIT_FORBIDDEN'||code==='OUTING_COMPLETED')return 'groups.'+code;
 if(code==='GROUP_ACCESS_LOST')return 'groups.accessLost';if(code==='GROUP_ADMIN_REQUIRED')return 'groups.groupOwnerOnly';
 if(code==='This endpoint is not available in the preview proxy.'||code==='Method not allowed for this preview endpoint.')return 'groups.operationUnavailable';
 const codes=['FRIEND_UNAVAILABLE','GROUP_FULL','TRANSFER_ADMIN_FIRST','REQUEST_REUSED','OUTING_EXISTS','EVENT_UNAVAILABLE','PLAN_CHANGED','INVALID_PLAN_CONTEXT','PROPOSAL_LIMIT','OUTING_COMPLETED','OUTING_EDIT_FORBIDDEN'];
 if(codes.includes(code??''))return 'groups.errors.'+code;
 if(e.status===404||e.status===405||e.status===410)return 'groups.operationUnavailable';
 if(e.status===403)return 'groups.actionForbidden';
 return 'groups.failed';
}
export class GroupsStore{
 private state:GroupsState={groups:[],messages:{},more:{},drafts:{},collection:{},collectionMore:{},historyMore:{},collectionStatus:{},collectionError:{},historyStatus:{},historyError:{},friends:[],friendsLoading:false,friendsError:null,events:[],catalogKey:'',catalogStatus:'idle',catalogError:null,catalogLoading:false,catalogMore:false,contextImpact:null,contextConflict:null,contextError:null,loading:true,busy:false,error:null,sendError:null,revoked:[]};
 private listeners=new Set<()=>void>();private closed=false;private reads=new Set<string>();private refreshAgain=new Set<string>();private pending=new Set<AbortController>();private ids=new Map<string,string>();private version=0;private catalogSerial=0;private gaps=new Map<string,number>();private oldestMore=new Map<string,boolean>();private historyCursor=new Map<string,string>();
 private readTargets=new Map<string,number>();private readAcknowledged=new Map<string,number>();private contextSerial=0;
 private collectionGaps=new Map<string,{before:number;after:number}[]>();private collectionOldestMore=new Map<string,boolean>();
 private historyGaps=new Map<string,{before:string;stop:string}[]>();private historyOldestMore=new Map<string,boolean>();
 constructor(private request:OutingsRequest,private current:()=>boolean,private newId:()=>string){}
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}};
 getSnapshot=()=>this.state;
 private active(){return !this.closed&&this.current()}
 private set(patch:Partial<GroupsState>){if(!this.active()||Object.entries(patch).every(([key,value])=>this.state[key as keyof GroupsState]===value))return;this.state={...this.state,...patch};this.listeners.forEach(fn=>fn())}
 dispose(){this.closed=true;for(const r of this.pending)r.abort();this.pending.clear();this.ids.clear();this.gaps.clear();this.oldestMore.clear();this.historyCursor.clear();this.collectionGaps.clear();this.collectionOldestMore.clear();this.historyGaps.clear();this.historyOldestMore.clear();this.readTargets.clear();this.readAcknowledged.clear();this.state={...this.state,groups:[],messages:{},drafts:{},collection:{},collectionStatus:{},collectionError:{},historyStatus:{},historyError:{},friends:[],events:[]};this.listeners.forEach(fn=>fn());this.listeners.clear()}
 private async call<T>(path:string,method:'GET'|'POST'='GET',body?:unknown){const controller=new AbortController();this.pending.add(controller);try{return await this.request<T>(path,method,body,controller.signal)}finally{this.pending.delete(controller)}}
 private key(kind:string,payload:unknown){const s=kind+JSON.stringify(payload);let id=this.ids.get(s);if(!id){id=this.newId();this.ids.set(s,id)}return id}
 draft(id:string,text:string){this.set({drafts:{...this.state.drafts,[id]:text}})}
 private revoke(id:string){
  this.version++;this.gaps.delete(id);this.oldestMore.delete(id);this.historyCursor.delete(id);this.readTargets.delete(id);this.readAcknowledged.delete(id);
  this.collectionGaps.delete(id);this.collectionOldestMore.delete(id);this.historyGaps.delete(id);this.historyOldestMore.delete(id);
  for(const key of this.ids.keys())if(key.startsWith('message:'+id)||key.startsWith('outing:'+id))this.ids.delete(key);
  const messages={...this.state.messages},drafts={...this.state.drafts},collection={...this.state.collection},more={...this.state.more},collectionMore={...this.state.collectionMore},historyMore={...this.state.historyMore},collectionStatus={...this.state.collectionStatus},collectionError={...this.state.collectionError},historyStatus={...this.state.historyStatus},historyError={...this.state.historyError};
  delete messages[id];delete drafts[id];delete collection[id];delete more[id];delete collectionMore[id];delete historyMore[id];
  delete collectionStatus[id];delete collectionError[id];delete historyStatus[id];delete historyError[id];
  this.set({groups:this.state.groups.filter(g=>g.id!==id),messages,drafts,collection,more,collectionMore,historyMore,collectionStatus,collectionError,historyStatus,historyError,revoked:[...new Set([...this.state.revoked,id])]})
 }
 // A missing operation or a coordinator/admin refusal is not evidence that the
 // actor lost their group membership. Older APIs used the same NOT_FOUND for
 // all three cases; verify through the canonical read before purging history.
 private async resolveFailure(cause:unknown,id?:string,version=this.version):Promise<string|undefined>{
  if(!this.active()||version!==this.version)return;
  const error=groupFailure(cause),code=groupErrorCode(cause),status=(cause as {status?:number}).status;
  if(!id)return error;
  if(code==='GROUP_ACCESS_LOST'){this.revoke(id);return 'groups.accessLost'}
  if(![403,404].includes(status??0)||!['groups.actionForbidden','groups.operationUnavailable'].includes(error))return error;
  if(code==='This endpoint is not available in the preview proxy.'||code==='Method not allowed for this preview endpoint.')return error;
  try{
   const fresh=parseGroups([await this.call('/outings/groups/'+id)])[0]!;
   if(!this.active()||version!==this.version)return;if(fresh.id!==id)bad();
   if(fresh.status==='pending'){
    this.revoke(id);this.set({groups:[...this.state.groups,fresh],revoked:this.state.revoked.filter(g=>g!==id)});
    return 'groups.invitationPending';
   }
   return status===404?'groups.operationUnavailable':error;
  }catch(check){
   if(!this.active()||version!==this.version)return;
   if(groupErrorCode(check)==='GROUP_ACCESS_LOST'){this.revoke(id);return 'groups.accessLost'}
   if((check as {status?:number}).status===401)return 'groups.sessionEnded';
   if(![403,404].includes((check as {status?:number}).status??0))return error;
   try{
    const groups=parseGroups(await this.call('/outings/groups'));
    if(!this.active()||version!==this.version)return;
    const present=groups.find(g=>g.id===id);
    if(!present&&groups.length<100){this.revoke(id);return 'groups.accessLost'}
    if(present?.status==='pending'){this.revoke(id);this.set({groups:[...this.state.groups,present],revoked:this.state.revoked.filter(g=>g!==id)});return 'groups.invitationPending'}
   }catch{/* An unavailable verification endpoint cannot prove lost access. */}
   return error;
  }
 }
 async load(id?:string){
  const scope=id??'list';if(!this.active())return;if(this.reads.has(scope)){this.refreshAgain.add(scope);return}this.reads.add(scope);const version=this.version;
  try{const data=await this.call<unknown>('/outings/groups'+(id?'/'+id:''));if(!this.active()||version!==this.version)return;
   const groups=parseGroups(id?[data]:data);
   for(const fresh of groups){const previous=this.state.groups.find(g=>g.id===fresh.id);if(previous&&(previous.status!==fresh.status||previous.joinedAt!==fresh.joinedAt||previous.visibleAfterSeq!==fresh.visibleAfterSeq))this.revoke(fresh.id)}
   if(!id){for(const old of this.state.groups)if(!groups.some(g=>g.id===old.id))this.revoke(old.id)}
   const refreshLegacyOrder=!!id&&this.state.groups.length>1&&(groups[0]?.activityAt===undefined||this.state.groups.some(g=>g.activityAt===undefined))&&groups[0]?.lastSeq!==this.state.groups.find(g=>g.id===id)?.lastSeq;
   const hydrated=groups.map(g=>{const old=this.state.groups.find(p=>p.id===g.id);return g.status==='accepted'&&old?{...(g.revision<old.revision?old:g),outings:mergeOutings(g.outings,old.outings)}:g});
   const next=orderGroups(id?(this.state.groups.some(g=>g.id===id)?this.state.groups.map(g=>g.id===id?hydrated[0]!:g):[...this.state.groups,...hydrated]):hydrated);
   const revoked=this.state.revoked.some(id=>groups.some(g=>g.id===id))?this.state.revoked.filter(id=>!groups.some(g=>g.id===id)):this.state.revoked;
   this.set({groups:JSON.stringify(next)===JSON.stringify(this.state.groups)?this.state.groups:next,loading:false,error:null,revoked});
   if(id&&groups[0]?.status==='accepted'){await this.loadMessages(id);const cursor=this.readTargets.get(id);if(cursor)void this.read(id,cursor)}
   if(refreshLegacyOrder)await this.load();
  }catch(e){const error=await this.resolveFailure(e,id,version);if(error)this.set({loading:false,error})}finally{this.reads.delete(scope);if(this.refreshAgain.delete(scope)&&this.active())void this.load(id)}
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
  }catch(e){const error=await this.resolveFailure(e,id,version);if(error)this.set({error})}finally{this.reads.delete('messages:'+id)}
 }
 async collection(id:string,older=false){
  if(!this.active()||this.reads.has('collection:'+id)||this.state.groups.find(g=>g.id===id)?.status!=='accepted')return;this.reads.add('collection:'+id);const version=this.version,old=this.state.collection[id]??[],gap=older?this.collectionGaps.get(id)?.[0]:undefined,before=older?gap?.before??old.at(-1)?.seq:undefined;
  this.set({collectionStatus:{...this.state.collectionStatus,[id]:'loading'},collectionError:{...this.state.collectionError,[id]:null}});
  try{const data=parseMessages(await this.call('/outings/groups/'+id+'/messages?collection=events'+(before?'&before='+before:'')));if(!this.active()||version!==this.version)return;
   const boundary=this.state.groups.find(g=>g.id===id)?.visibleAfterSeq??0;
   const minimum=data.items.at(-1)?.seq;if(data.hasMore&&minimum===undefined)bad();
   if(!old.length||older&&!gap||!data.hasMore)this.collectionOldestMore.set(id,data.hasMore);
   // A refreshed first page covers only its own range; retain authorized older
   // pages and the known end. Sequence gaps also cover sparse event-only feeds.
   let gaps=this.collectionGaps.get(id)??[];
   const coveredFrom=data.hasMore?minimum!:boundary;
   gaps=gaps.flatMap(g=>g.before<=coveredFrom?[g]:g.after+1<coveredFrom?[{...g,before:coveredFrom}]:[]);
   if(!older&&old.length&&data.hasMore&&minimum! > old[0]!.seq+1)gaps=[{before:minimum!,after:old[0]!.seq},...gaps];
   this.collectionGaps.set(id,gaps.sort((a,b)=>b.before-a.before));
   const retained=old.filter(m=>older&&before!==undefined&&m.seq>=before||data.hasMore&&m.seq<minimum!);
   const all=[...new Map([...retained,...data.items].filter(m=>m.seq>boundary).map(m=>[m.id,m])).values()].sort((a,b)=>b.seq-a.seq);
   const more=gaps.length>0||(this.collectionOldestMore.get(id)??data.hasMore);
   this.set({collection:{...this.state.collection,[id]:all},collectionMore:{...this.state.collectionMore,[id]:more},collectionStatus:{...this.state.collectionStatus,[id]:'success'},collectionError:{...this.state.collectionError,[id]:null}})
  }catch(e){const error=await this.resolveFailure(e,id,version);if(error&&!this.state.revoked.includes(id))this.set({collectionStatus:{...this.state.collectionStatus,[id]:'error'},collectionError:{...this.state.collectionError,[id]:error==='groups.failed'?'groups.collectionLoadFailed':error}})}finally{this.reads.delete('collection:'+id);if(this.active()&&version!==this.version&&this.state.groups.find(g=>g.id===id)?.status==='accepted')await this.collection(id,older);else if(this.active()&&this.state.collectionStatus[id]==='loading')this.set({collectionStatus:{...this.state.collectionStatus,[id]:'idle'}})}
 }
 async loadPlan(groupId:string,planId:string){
  if(!this.active()||this.reads.has('plan:'+planId))return;this.reads.add('plan:'+planId);const version=this.version;
  try{const plan=parsePlans([await this.call('/outings/plans/'+planId)])[0]!;if(!this.active()||version!==this.version)return;if(plan.groupId!==groupId)bad();this.set({groups:this.state.groups.map(g=>g.id===groupId?{...g,outings:mergeOutings([plan],g.outings)}:g)})}
  catch(e){const error=await this.resolveFailure(e,groupId,version);if(error)this.set({error})}finally{this.reads.delete('plan:'+planId)}
 }
 async loadHistory(id:string,older=false){
  if(!this.active()||this.reads.has('history:'+id)||this.state.groups.find(g=>g.id===id)?.status!=='accepted')return;this.reads.add('history:'+id);const version=this.version;
  const gap=older?this.historyGaps.get(id)?.[0]:undefined,before=older?gap?.before??this.historyCursor.get(id):undefined;
  const previous=this.state.groups.find(g=>g.id===id)?.outings??[],hadCursor=this.historyCursor.has(id);
  this.set({historyStatus:{...this.state.historyStatus,[id]:'loading'},historyError:{...this.state.historyError,[id]:null}});
  try{const data=await this.call<{items:OutingPlan[];hasMore:boolean}>('/outings/groups/'+id+'/outings'+(before?'?before='+before:''));const plans=parsePlans(data.items);if(typeof data.hasMore!=='boolean'||plans.some(p=>p.groupId!==id))bad();if(!this.active()||version!==this.version)return;
   if(data.hasMore&&!plans.length)bad();
   if(!hadCursor||older&&!gap){if(plans.length)this.historyCursor.set(id,plans.at(-1)!.id);this.historyOldestMore.set(id,data.hasMore)}
   if(!data.hasMore)this.historyOldestMore.set(id,false);
   let gaps=this.historyGaps.get(id)??[];
   const seen=new Set(plans.map(p=>p.id));
   if(!data.hasMore)gaps=[];
   else if(gap)gaps=gaps.flatMap(g=>seen.has(g.stop)?[]:g===gap?[{...g,before:plans.at(-1)!.id}]:[g]);
   else if(!older&&hadCursor&&previous.length&&plans.length&&!plans.some(p=>previous.some(old=>old.id===p.id)))gaps=[{before:plans.at(-1)!.id,stop:previous[0]!.id},...gaps];
   else if(!older)gaps=gaps.filter(g=>!seen.has(g.stop));
   this.historyGaps.set(id,gaps);
   this.set({groups:this.state.groups.map(g=>g.id===id?{...g,outings:mergeOutings(plans,g.outings)}:g),historyMore:{...this.state.historyMore,[id]:gaps.length>0||(this.historyOldestMore.get(id)??data.hasMore)},historyStatus:{...this.state.historyStatus,[id]:'success'},historyError:{...this.state.historyError,[id]:null}})
  }catch(e){const error=await this.resolveFailure(e,id,version);if(error&&!this.state.revoked.includes(id))this.set({historyStatus:{...this.state.historyStatus,[id]:'error'},historyError:{...this.state.historyError,[id]:error==='groups.failed'?'groups.historyLoadFailed':error}})}finally{this.reads.delete('history:'+id);if(this.active()&&version!==this.version&&this.state.groups.find(g=>g.id===id)?.status==='accepted')await this.loadHistory(id,older);else if(this.active()&&this.state.historyStatus[id]==='loading')this.set({historyStatus:{...this.state.historyStatus,[id]:'idle'}})}
 }
 async loadFriends(){
  if(!this.active()||this.reads.has('friends'))return;this.reads.add('friends');this.set({friendsLoading:true,friendsError:null});
  try{const friends=await this.call<PlanFriend[]>('/friends');if(!this.active())return;if(!Array.isArray(friends))bad();this.set({friends,friendsError:null})}
  catch(e){if(this.active())this.set({friendsError:groupFailure(e)})}finally{this.reads.delete('friends');this.set({friendsLoading:false})}
 }
 async catalog(query='',context?:{date?:string;city?:string},page=1){
  if(!this.active())return;const key=groupCatalogKey(query,context),replace=page===1||key!==this.state.catalogKey;
  this.set({catalogKey:key,catalogStatus:'loading',catalogLoading:true,catalogError:null,...(replace?{events:[],catalogMore:false}:{})});
  const serial=++this.catalogSerial;try{
   const params=new URLSearchParams({q:query.trim(),page:String(replace?1:page)});if(context?.city)params.set('city',canonicalPlanningCity(context.city)??context.city.trim());
   if(context?.date)params.set('nightDate',context.date);
   const events=await this.call<PlanEvent[]>('/events?'+params);if(!Array.isArray(events))bad();
   if(!this.active()||serial!==this.catalogSerial)return;
   this.set({events:replace?events:[...new Map([...this.state.events,...events].map(e=>[e.id,e])).values()],catalogMore:events.length>=20,catalogStatus:'success',catalogError:null});
  }catch(e){if(this.active()&&serial===this.catalogSerial)this.set({catalogError:groupFailure(e),catalogStatus:'error'})}finally{if(serial===this.catalogSerial)this.set({catalogLoading:false})}
 }
 resetContextFeedback(){this.contextSerial++;this.set({contextImpact:null,contextConflict:null,contextError:null})}
 async editContext(group:string,plan:string,payload:OutingContextDraft):Promise<OutingPlan|undefined>{
  if(!this.active()||this.state.busy)return;const feedback=++this.contextSerial;this.version++;this.set({busy:true,contextImpact:null,contextConflict:null,contextError:null});
  const version=this.version;try{
   const updated=parsePlans([await this.call('/outings/plans/'+plan+'/context','POST',payload)])[0]!;
   if(!this.active()||version!==this.version)return;if(updated.id!==plan||updated.groupId!==group)bad();
   this.set({groups:this.state.groups.map(g=>g.id===group?{...g,outings:mergeOutings([updated],g.outings)}:g)});await this.load(group);return updated;
  }catch(e){if(!this.active()||version!==this.version)return;
   const cause=e as {code?:string;title?:string;data?:components['schemas']['OutingContextError']};const code=cause.code??cause.title??cause.data?.error;
   if(code==='CONTEXT_CONFIRMATION_REQUIRED'&&cause.data?.impact){if(feedback===this.contextSerial)this.set({contextImpact:cause.data.impact})}
   else if(code==='OUTING_EXISTS'&&isOutingId(cause.data?.existingPlanId)){if(feedback===this.contextSerial)this.set({contextConflict:cause.data.existingPlanId,contextError:'groups.contextConflict'})}
   else {const error=await this.resolveFailure(e,group,version);if(error&&feedback===this.contextSerial)this.set({contextError:code==='PLAN_CHANGED'?'groups.contextStale':error})}
   return undefined;
  }finally{this.set({busy:false})}
 }
 private async mutate<T>(path:string,payload:unknown,group?:string,options?:GroupActionOptions):Promise<T|undefined>{
  if(!this.active()||this.state.busy)return;const version=++this.version;this.set({busy:true,error:null});try{
   const value=await this.call<T>(path,'POST',payload);if(!this.active())return;await this.load(group);return value;
  }catch(e){const error=await this.resolveFailure(e,group,version);if(error){if(options?.feedback==='inline')throw new GroupActionError(error);this.set({error})}return undefined}finally{this.set({busy:false})}
 }
 async create(name:string,friendIds:string[],eventId?:string){const body={name:name.trim(),friendIds,...(eventId?{eventId}:{})};const result=await this.mutate<FriendGroup>('/outings/groups',{...body,requestId:this.key('group',body)});if(result){parseGroups([result]);this.ids.delete('group'+JSON.stringify(body));this.set({groups:orderGroups(this.state.groups.some(g=>g.id===result.id)?this.state.groups.map(g=>g.id===result.id?result:g):[result,...this.state.groups])})}return result}
 async action(id:string,payload:GroupAction){const result=await this.mutate('/outings/groups/'+id+'/actions',payload,['leave','decline'].includes(payload.action)?undefined:id);if(result&&['leave','decline'].includes(payload.action))this.revoke(id);return result}
 async send(id:string,eventId?:string){
  const content=eventId?'':this.state.drafts[id]??'',body={content,eventId};if(!content.trim()&&!eventId)return;if(!this.active()||this.state.busy)return;
  const requestId=this.key('message:'+id,body);this.set({sendError:null});const result=await this.mutate('/outings/groups/'+id+'/messages',{...body,requestId},id);
  if(result){this.ids.delete('message:'+id+JSON.stringify(body));if(!eventId&&this.state.drafts[id]===content)this.draft(id,'')}
  else this.set({sendError:'groups.messageFailed'});return result;
 }
 async createOuting(id:string,draft:GroupOutingDraft){
  const created=await this.mutate<OutingPlan>('/outings/groups/'+id+'/outings',{...draft,requestId:this.key('outing:'+id,draft)},id);
  if(created){parsePlans([created]);if(created.groupId!==id)bad();this.ids.delete('outing:'+id+JSON.stringify(draft));this.set({groups:this.state.groups.map(g=>g.id===id?{...g,outings:mergeOutings([created],g.outings)}:g)})}
  return created;
 }
 planAction(group:string,plan:string,action:string,payload:unknown,options?:GroupActionOptions){
  const current=this.state.groups.find(g=>g.id===group)?.outings.find(p=>p.id===plan);
  const guarded=['availability','date','vote','proposals','choose','remove-proposal'].includes(action)&&object(payload)?{revision:current?.revision,...payload}:payload;
  return this.mutate('/outings/plans/'+plan+'/'+action,guarded,group,options)
 }
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
