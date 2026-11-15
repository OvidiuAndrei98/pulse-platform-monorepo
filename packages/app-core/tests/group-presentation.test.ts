import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {conversationTitle,conversationPreview,decisionState,decisionQuestion,friendsEventGroups,groupEventDate,isCurrentOutingMessage,outingTitle,outingContextLabel} from '../src/social/groupPresentation';
import {translate} from '../src/i18n/translate';
import {parseGroups,parseMessages,type FriendGroup,type GroupMessage} from '../src/social/groups';
import type {OutingPlan} from '../src/outings/model';
import type {SocialFeedItem} from '../src/social/feedTypes';
const id=(n:number)=>`88888888-8888-4888-8888-${String(n).padStart(12,'0')}`;
const now=Date.parse('2026-11-15T12:00:00Z');
const p=(patch:Partial<OutingPlan>={}):OutingPlan=>({id:id(20),groupId:id(1),ownerId:id(2),title:'2026-11-18',status:'accepted',revision:1,decisionRound:1,city:'Bucuresti',expiresAt:'2026-11-19T04:00:00Z',members:[{userId:id(2),username:'Ana',status:'accepted',hasTicket:true},{userId:id(3),username:'Radu',status:'accepted',attendance:'unanswered'},{userId:id(4),username:'Mara',status:'pending'}],options:[],candidateDates:[{date:'2026-11-18',responses:[]}],...patch});
const g=(patch:Partial<FriendGroup>={}):FriendGroup=>({id:id(1),name:'',ownerId:id(2),status:'accepted',revision:1,lastSeq:0,visibleAfterSeq:0,unread:0,muted:false,preview:'',members:[{userId:id(2),username:'Ana',status:'accepted'},{userId:id(3),username:'Radu',status:'accepted'},{userId:id(4),username:'Mara',status:'pending'}],outings:[],outingsHasMore:false,...patch});
const en=(key:string,values?:Record<string,string|number>)=>translate('en',key,values);
const option=(n:number)=>({eventId:id(n),title:'After dark',location:'Venue',startTime:'2026-11-18T21:00:00Z',available:true});

test('explicit conversation names are preserved; only genuinely unnamed groups derive names',()=>{
 assert.equal(conversationTitle(g({name:'Ana, Radu, Mara'}),id(2)),'Ana, Radu, Mara');
 assert.equal(conversationTitle(g(),id(2)),'Radu, Mara');
 const many=g({members:[...g().members,{userId:id(5),username:'Ioana',status:'accepted'}]});
 assert.equal(conversationTitle(many,id(2)),'Radu, Mara +1');
 assert.equal(conversationTitle(many,id(2),true),'Radu, Mara, Ioana');
});
test('conversation previews localize structured outings without reinterpreting ordinary text',()=>{
 const group=g({previewKind:'outing',previewAuthor:'Ana',preview:'2026-11-18',previewDate:'2026-11-18'});
 assert.match(conversationPreview(group,'en',en),/^Ana: Outing ·/);assert.doesNotMatch(conversationPreview(group,'en',en),/2026-11-18/);
 assert.equal(conversationPreview(g({previewKind:'text',preview:'2026-11-18'}),'en',en),'2026-11-18');
 assert.equal(conversationPreview(g({status:'pending',preview:'private'}),'en',en),'Invitation pending');
 assert.equal(outingTitle(p(),'en').includes('2026-11-18'),false);
});
test('event dates use the Bucharest occurrence, never the purchase time, and disambiguate year',()=>{
 assert.equal(groupEventDate('2027-01-01T00:30:00Z','en',now),'1 Jan 2027 · 02:30');
 assert.equal(groupEventDate('invalid','en',now),'');
});

test('outing headings follow the saved date without duplicating it or rewriting explicit names',()=>{
 const changed={title:'2026-11-18',outingDate:'2026-11-25',city:'Bucuresti'};
 assert.match(outingTitle(changed,'en'),/25/);assert.doesNotMatch(outingTitle(changed,'en'),/18/);
 assert.equal(outingContextLabel(changed,'en'),'Bucuresti');
 const named={...changed,title:'Our Wednesday'};
 assert.equal(outingTitle(named,'en'),'Our Wednesday');assert.match(outingContextLabel(named,'en'),/25.* · Bucuresti/);
 assert.equal(outingContextLabel({title:'Our Wednesday',city:'Bucuresti'},'en'),'Bucuresti');
 const snapshot={...changed,outingDate:'2026-11-18'};
 assert.match(outingTitle(snapshot,'en'),/18/);assert.equal(outingContextLabel(snapshot,'en'),'Bucuresti');
});
test('availability counts accepted participants only, independently of tickets and invitations',()=>{
 const plan=p({candidateDates:[{date:'2026-11-18',responses:[{userId:id(2),answer:'maybe'},{userId:id(3),answer:'yes'},{userId:id(4),answer:'yes'}]}]});
 const state=decisionState(plan,id(3),{date:'2026-11-18',group:g(),now});
 assert.equal(state.kind,'availability');assert.equal(state.current,'yes');assert.equal(state.answered,2);assert.equal(state.eligible,2);assert.equal(state.pending,1);
 assert.equal(state.choices[0].count,1);assert.equal(state.choices[1].count,1);assert.equal(state.canVote,true);
 assert.equal(decisionState(plan,id(4),{date:'2026-11-18',now}).canVote,false);
 assert.match(decisionQuestion(plan,'en',en,{date:'2026-11-18',now}),/Can you go out/);
});
test('preferences support multiple events and do not reinterpret legacy maybe or no as support',()=>{
 const plan=p({outingDate:'2026-11-18',options:[{...option(30),reactions:[{userId:id(3),answer:'yes'}]},{...option(31),reactions:[{userId:id(3),answer:'yes'}]},{...option(32),reactions:[{userId:id(3),answer:'maybe'},{userId:id(2),answer:'no'}]}]});
 assert.equal(decisionState(plan,id(3),{eventId:id(30),now}).current,'yes');
 assert.equal(decisionState(plan,id(3),{eventId:id(31),now}).current,'yes');
 const legacy=decisionState(plan,id(3),{eventId:id(32),now});
 assert.equal(legacy.current,undefined);assert.equal(legacy.answered,0);assert.deepEqual(legacy.choices.map(choice=>choice.value),['yes']);
 assert.deepEqual(plan.options[2]!.reactions?.map(response=>response.answer),['maybe','no']);
 assert.equal(plan.chosenEventId,undefined);assert.equal(decisionState(plan,id(2),{eventId:id(30),now}).current,undefined);
});
test('attendance exposes only coming and declining without converting historic maybe or availability',()=>{
 const plan=p({chosenEventId:id(30),candidateDates:[{date:'2026-11-18',responses:[{userId:id(2),answer:'yes'}]}],members:[{userId:id(2),username:'Ana',status:'accepted',hasTicket:true,attendance:'maybe'},{userId:id(3),username:'Radu',status:'accepted',attendance:'no'}]});
 const state=decisionState(plan,id(2),{now});
 assert.equal(state.current,undefined);assert.equal(state.answered,1);assert.equal(state.eligible-state.answered,1);
 assert.deepEqual(state.choices.map(choice=>[choice.value,choice.count]),[['yes',0],['no',1]]);
 assert.equal(plan.members[0]!.attendance,'maybe');assert.equal(plan.candidateDates![0]!.responses[0]!.answer,'yes');
});
test('attendance is separate from availability, preferences and ticket ownership',()=>{
 const plan=p({chosenEventId:id(30),options:[{...option(30),reactions:[{userId:id(2),answer:'yes'}]}],members:[{userId:id(2),username:'Ana',status:'accepted',hasTicket:true,attendance:'unanswered'},{userId:id(3),username:'Radu',status:'accepted',hasTicket:false,attendance:'yes'}]});
 const state=decisionState(plan,id(2),{now});assert.equal(state.kind,'attendance');assert.equal(state.current,undefined);assert.equal(state.answered,1);assert.equal(state.choices[0].members[0]?.userId,id(3));
 assert.equal(decisionState(plan,id(3),{now}).current,'yes');assert.equal(decisionState(plan,id(3),{eventId:id(30),now}).closed,true);
});
test('ended, cancelled and deadline-expired decisions close; attendance keeps its separate deadline',()=>{
 for(const patch of [{lifecycle:'completed' as const},{lifecycle:'cancelled' as const},{expiresAt:'2026-11-14T10:00:00Z'},{decisionAt:'2026-11-15T10:00:00Z'}])assert.equal(decisionState(p(patch),id(2),{now}).canVote,false);
 assert.equal(decisionState(p({chosenEventId:id(30),decisionAt:'2026-11-15T10:00:00Z'}),id(2),{now}).canVote,true);
 assert.equal(decisionState(p(),id(2),{date:'2026-12-01',now}).canVote,false);
});
test('outing messages retain their original context and never inherit a later question',()=>{
 const plan=p();const message:GroupMessage={id:id(90),requestId:id(91),senderId:id(2),username:'Ana',seq:1,kind:'outing',content:'',createdAt:'2026-11-15T12:00:00Z',outingId:plan.id,outingContext:{decisionRound:1,title:plan.title,city:'București',candidateDates:['2026-11-18']}};
 assert.equal(isCurrentOutingMessage(message,plan),true);
 assert.equal(isCurrentOutingMessage(message,{...plan,revision:22}),true);
 assert.equal(isCurrentOutingMessage(message,{...plan,decisionRound:2}),false);
 assert.equal(isCurrentOutingMessage(message,{...plan,chosenEventId:id(30)}),false);
 assert.equal(isCurrentOutingMessage(message,{...plan,outingDate:'2026-11-18'}),false);
 assert.equal(isCurrentOutingMessage({...message,outingContext:undefined},plan),false);
});

test('message snapshots are validated before rendering and remain optional for old history',()=>{
 const message:GroupMessage={id:id(90),requestId:id(91),senderId:id(2),username:'Ana',seq:1,kind:'outing',content:'',createdAt:'2026-11-15T12:00:00Z',outingId:id(20)};
 const context={decisionRound:1,title:'Friday',city:'Bucuresti',candidateDates:['2026-11-18']};
 assert.equal(parseMessages({items:[message],hasMore:false}).items[0]!.outingContext,undefined);
 assert.deepEqual(parseMessages({items:[{...message,outingContext:context}],hasMore:false}).items[0]!.outingContext,context);
 for(const malformed of [{...context,candidateDates:'2026-11-18'},{...context,candidateDates:['2026-02-31']},{...context,decisionRound:0},{...context,chosenEventId:'bad-id'}])assert.throws(()=>parseMessages({items:[{...message,outingContext:malformed}],hasMore:false}),/INVALID_RESPONSE/);
 assert.throws(()=>parseMessages({items:[{...message,kind:'text',outingContext:context}],hasMore:false}),/INVALID_RESPONSE/);
 assert.throws(()=>parseGroups([g({status:'pending',previewAuthor:'Private author'})]),/INVALID_RESPONSE/);
 assert.throws(()=>parseGroups([g({previewDate:'2026-02-31'})]),/INVALID_RESPONSE/);
});
test('friend event projections count distinct authorized people and filter by known end, not start',()=>{
 const item=(patch:Partial<SocialFeedItem>={}):SocialFeedItem=>({activityType:'friend_ticket',occurredAt:'2026-11-14T00:00:00Z',actorId:id(3),actorUsername:'Radu',eventId:id(30),eventTitle:'After dark',eventStartTime:'2026-11-14T23:00:00Z',eventEndTime:'2026-11-15T23:00:00Z',eventLocation:'Venue',eventCity:'Bucuresti',...patch});
 const rows=friendsEventGroups([item(),item(),item({activityType:'friend_going'}),item({actorId:id(4),activityType:'friend_going'}),item({eventId:id(31),eventEndTime:'2026-11-15T10:00:00Z'}),item({activityType:'organizer_event'})],now);
 assert.equal(rows.length,1);assert.equal(rows[0]!.actors.length,2);assert.equal(rows[0]!.ticketActors.length,1);assert.equal(rows[0]!.goingActors.length,2);assert.equal(rows[0]!.eventLocation,'Venue');
});
test('social and decision copy pluralizes people without mixing them with ticket inventory',()=>{
 assert.equal(en('groups.friendsWithTickets',{count:1}),'1 friend has a ticket');assert.equal(en('groups.friendsWithTickets',{count:2}),'2 friends have tickets');
 assert.equal(translate('ro','groups.invitedCount',{count:1}),'1 invitație în așteptare');assert.equal(en('groups.suggestionsCount',{count:2}),'2 suggestions');
});
