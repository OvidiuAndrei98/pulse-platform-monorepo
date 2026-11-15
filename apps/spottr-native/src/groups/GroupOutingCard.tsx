import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,StyleSheet,View} from 'react-native';
import {Check,ChevronRight,Plus,RotateCcw} from 'lucide-react-native';
import type {OutingPlan} from '@packages/app-core/outings/model';
import {GroupActionError,type GroupMessage,type FriendGroup} from '@packages/app-core/social/groups';
import {decisionState,isCurrentOutingMessage,outingTitle,outingContextLabel} from '@packages/app-core/social/groupPresentation';
import {formatRon} from '@packages/app-core/events/serviceFee';
import {Text} from '../ui/Text';
import {ActionButton} from '../ui/ActionButton';
import {colors} from '../ui/theme';
import {MemberAvatar,OutingPressable} from '../outings/OutingPrimitives';
import {usePreferences} from '../usePreferences';
import {EventPreview} from './GroupContent';
import {groupStyles as g} from './groupStyles';

export type AttendanceAnswer='yes'|'no';
type SaveFeedback={getError?:()=>string|null|undefined;disabled?:boolean;testID:string};

/** Only acknowledge the server result. Keep a failed choice available for retry. */
function useResponse<T extends string|boolean>(save:(value:T)=>Promise<unknown>,disabled:boolean,getError?:()=>string|null|undefined){
 const [pending,setPending]=useState<T|null>(null),[failure,setFailure]=useState<{value:T;key:string}|null>(null);
 const alive=useRef(true),saving=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const submit=async(value:T)=>{
  if(disabled||saving.current)return;
  saving.current=true;setPending(value);setFailure(null);
  try{const result=await save(value);if(!result&&alive.current)setFailure({value,key:getError?.()??'groups.responseSaveError'})}
  catch(error){if(alive.current)setFailure({value,key:error instanceof GroupActionError?error.key:getError?.()??'groups.responseSaveError'})}
  finally{saving.current=false;if(alive.current)setPending(null)}
 };
 return {pending,failure,submit};
}
function ResponseFailure({message,retry,disabled,testID}:{message?:string;retry:()=>void;disabled:boolean;testID:string}){
 const {copy}=usePreferences('copy');
 return message?<View testID={testID+'-error'} style={s.error}><Text accessibilityRole="alert" style={[g.caption,{color:colors.danger,flex:1}]}>{copy(message)}</Text><OutingPressable testID={testID+'-retry'} disabled={disabled} accessibilityLabel={copy('groups.responseRetry')} onPress={retry} style={s.retry}><RotateCcw size={17} color={colors.text}/></OutingPressable></View>:null;
}
function Supporters({members,count=true}:{members:OutingPlan['members'];count?:boolean}){
 return members.length?<View style={s.supporters}><View style={s.avatars} pointerEvents="none">{members.slice(0,3).map((member,index)=><View key={member.userId} style={{marginLeft:index?-8:0}}><MemberAvatar name={member.username} userId={member.userId} uri={member.avatarUrl} size={24}/></View>)}</View>{count&&<Text style={g.caption}>{members.length}</Text>}</View>:null;
}

/** One personal, reversible preference per event; it never chooses a destination. */
export function EventPreference({plan,group,actor,eventId,busy=false,onToggle,getError,testID}:{plan:OutingPlan;group?:FriendGroup;actor?:string;eventId:string;busy?:boolean;onToggle:(selected:boolean)=>Promise<unknown>} & Omit<SaveFeedback,'disabled'>){
 const {copy}=usePreferences('copy'),state=decisionState(plan,actor,{eventId,group}),checked=state.current==='yes',disabled=busy||!state.canVote;
 const action=useResponse(onToggle,disabled,getError),saving=action.pending!==null;
 const supporters=state.choices.find(choice=>choice.value==='yes')?.members??[];
 return <View style={{gap:4}}>
  <View style={s.preferenceRow}>
   <OutingPressable testID={testID} accessibilityRole="checkbox" aria-checked={checked} accessibilityState={{checked,disabled:disabled||saving,busy:saving}} accessibilityLabel={copy('groups.wouldGo')} disabled={disabled||saving} onPress={()=>void action.submit(!checked)} style={[s.preference,checked&&s.selected]}>
    {saving?<ActivityIndicator size="small" color={colors.accent}/>:checked?<Check size={17} color={colors.accent}/>:<Plus size={17} color={colors.text}/>}<Text style={[g.muted,{color:checked?colors.accent:colors.text,fontWeight:'600'}]}>{copy('groups.wouldGo')}</Text>
   </OutingPressable><Supporters members={supporters}/>
  </View>
  <ResponseFailure testID={testID} message={action.failure?.key} disabled={disabled||saving} retry={()=>{if(action.failure)void action.submit(action.failure.value)}}/>
 </View>;
}

/** The invitation in chat and the chosen event use this same two-answer control. */
export function AttendanceResponse({plan,group,actor,busy=false,onRespond,getError,testID='group-response'}:{plan:OutingPlan;group?:FriendGroup;actor?:string;busy?:boolean;onRespond:(answer:AttendanceAnswer)=>Promise<unknown>} & Partial<Omit<SaveFeedback,'disabled'>>){
 const {copy}=usePreferences('copy'),state=decisionState(plan,actor,{group}),disabled=busy||!state.canVote;
 const action=useResponse(onRespond,disabled,getError),saving=action.pending!==null;
 const yes=state.choices.find(choice=>choice.value==='yes'),no=state.choices.find(choice=>choice.value==='no'),unanswered=state.eligible-(yes?.count??0)-(no?.count??0);
 return <View testID={testID+'-poll'} style={{gap:12}}>
  <Text style={g.heading}>{copy('groups.comingQuestion')}</Text>
  <View accessibilityRole="radiogroup" testID={testID} style={s.attendance}>
   {(['yes','no'] as const).map(value=><ActionButton key={value} testID={testID+'-'+value} title={copy(value==='yes'?'groups.comingYes':'groups.comingNo')} accessibilityRole="radio" aria-checked={state.current===value} accessibilityState={{checked:state.current===value}} tone={value==='yes'?'primary':'secondary'} style={[{flex:1},state.current===value&&{borderColor:value==='yes'?colors.text:colors.accent}]} icon={state.current===value&&action.pending!==value?<Check size={16}/>:undefined} busy={action.pending===value} disabled={disabled||saving} onPress={()=>{if(state.current!==value)void action.submit(value)}}/>)}
  </View>
  <ResponseFailure testID={testID} message={action.failure?.key} disabled={disabled||saving} retry={()=>{if(action.failure)void action.submit(action.failure.value)}}/>
  <View style={s.preferenceRow}><Supporters members={yes?.members??[]} count={false}/><Text style={[g.caption,{flex:1}]}>{copy('groups.comingCount',{count:yes?.count??0})}{unanswered?' · '+copy('groups.notAnsweredCount',{count:unanswered}):''}</Text></View>
  {!!state.pending&&<Text style={g.caption}>{copy('groups.invitedCount',{count:state.pending})}</Text>}
  {state.closed&&<Text style={g.caption}>{copy('groups.decisionClosed')}</Text>}
 </View>;
}

export function ProposalPreview({plan,eventId,onOpen}:{plan:OutingPlan;eventId:string;onOpen:()=>void}){
 const {copy}=usePreferences('copy'),event=plan.options.find(option=>option.eventId===eventId);
 if(!event)return null;
 return <EventPreview title={event.title} imageUrl={event.imageUrl} startTime={event.startTime} location={event.location} city={plan.city} onPress={onOpen}>{event.totalPriceRon!==undefined&&<Text style={[g.caption,{color:colors.text}]}>{formatRon(event.totalPriceRon)}</Text>}</EventPreview>;
}

export function GroupOutingCard({plan,group,message,actor,busy,onRespond,onToggle,getError,onOpen,onEvent}:{plan?:OutingPlan;group?:FriendGroup;message:GroupMessage;actor?:string;busy:boolean;onRespond:(plan:OutingPlan,answer:AttendanceAnswer)=>Promise<unknown>;onToggle:(plan:OutingPlan,eventId:string,selected:boolean)=>Promise<unknown>;getError?:()=>string|null|undefined;onOpen:()=>void;onEvent:(id:string)=>void}){
 const {copy,language}=usePreferences('copy'),current=isCurrentOutingMessage(message,plan),context=message.outingContext;
 const proposer=group?.members.find(member=>member.userId===message.senderId)?.username;
 return <View testID="group-outing-message-card" style={s.card}>
  <View style={{gap:4}}><Text style={g.caption}>{proposer?copy('outings.v2.proposedBy',{name:proposer}):copy('groups.viewOuting')}</Text>{(!current||!plan?.chosenEventId)&&<><Text style={g.heading}>{current&&plan?outingTitle(plan,language):context?.title?outingTitle(context,language):copy('groups.earlierOuting')}</Text>{!!context&&<Text style={g.muted}>{outingContextLabel(context,language)}</Text>}</>}</View>
  {current&&plan?(plan.chosenEventId?<>
   <ProposalPreview plan={plan} eventId={plan.chosenEventId} onOpen={()=>onEvent(plan.chosenEventId!)}/>
   <AttendanceResponse key={plan.id+':'+plan.decisionRound} plan={plan} group={group} actor={actor} busy={busy} onRespond={answer=>onRespond(plan,answer)} getError={getError} testID="group-chat-response"/>
  </>:<>
   <Text style={g.muted}>{copy('groups.compareEvents')}</Text>
   {plan.options.slice(0,2).map(option=><View key={option.eventId} style={{gap:8}}><ProposalPreview plan={plan} eventId={option.eventId} onOpen={()=>onEvent(option.eventId)}/><EventPreference plan={plan} group={group} actor={actor} eventId={option.eventId} busy={busy} onToggle={selected=>onToggle(plan,option.eventId,selected)} getError={getError} testID={'group-chat-preference-'+option.eventId}/></View>)}
   {!plan.options.length&&<Text style={g.muted}>{copy(plan.outingDate?'groups.noEventChosen':'groups.creatorChoosingNight')}</Text>}
  </>):<Text style={g.muted}>{copy('groups.earlierOutingHint')}</Text>}
  <OutingPressable testID="group-chat-view-outing" onPress={onOpen} style={s.open}><Text style={[g.body,{fontWeight:'600',flex:1}]}>{copy('groups.viewOuting')}</Text><ChevronRight size={18} color={colors.muted}/></OutingPressable>
 </View>;
}
const s=StyleSheet.create({
 card:{gap:16,width:'100%',padding:16,borderRadius:16,backgroundColor:colors.surface},
 attendance:{flexDirection:'row',alignItems:'stretch',gap:8},preferenceRow:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},
 preference:{minHeight:44,paddingVertical:10,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:8,borderRadius:22,backgroundColor:colors.raised,borderWidth:1,borderColor:'transparent'},selected:{borderColor:colors.accent,backgroundColor:'#211019'},
 supporters:{flexDirection:'row',alignItems:'center',gap:8},avatars:{flexDirection:'row',alignItems:'center'},error:{flexDirection:'row',gap:8,alignItems:'center'},retry:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},
 open:{minHeight:44,flexDirection:'row',alignItems:'center',gap:12},
});

