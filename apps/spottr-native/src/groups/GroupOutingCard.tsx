import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,StyleSheet,View} from 'react-native';
import {Check,ChevronRight,Plus,RotateCcw} from 'lucide-react-native';
import type {OutingPlan} from '@packages/app-core/outings/model';
import {GroupActionError,type GroupMessage,type FriendGroup} from '@packages/app-core/social/groups';
import {decisionState,isCurrentOutingMessage,groupNightDate,outingTitle} from '@packages/app-core/social/groupPresentation';
import {formatRon} from '@packages/app-core/events/serviceFee';
import {Text} from '../ui/Text';
import {ActionButton} from '../ui/ActionButton';
import {colors} from '../ui/theme';
import {MemberAvatar,OutingPressable} from '../outings/OutingPrimitives';
import {usePreferences} from '../usePreferences';
import {EventPreview} from './GroupContent';
import {useDirectAttendance,type AttendanceAnswer} from './useDirectAttendance';
export type {AttendanceAnswer} from './useDirectAttendance';
import {groupStyles as g} from './groupStyles';

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
export function EventPreference({plan,group,actor,eventId,busy=false,onToggle,getError,testID,compact=false,onOpen}:{plan:OutingPlan;group?:FriendGroup;actor?:string;eventId:string;busy?:boolean;onToggle:(selected:boolean)=>Promise<unknown>;compact?:boolean;onOpen?:()=>void} & Omit<SaveFeedback,'disabled'>){
 const {copy}=usePreferences('copy'),state=decisionState(plan,actor,{eventId,group}),checked=state.current==='yes',disabled=busy||!state.canVote;
 const action=useResponse(onToggle,disabled,getError),saving=action.pending!==null;
 const supporters=state.choices.find(choice=>choice.value==='yes')?.members??[];
 return <View style={{gap:4}}>
  <View style={s.preferenceRow}>
   <OutingPressable testID={testID} accessibilityRole="checkbox" aria-checked={checked} accessibilityState={{checked,disabled:disabled||saving,busy:saving}} accessibilityLabel={copy(compact&&action.failure?action.failure.key:'groups.wouldGo')} disabled={disabled||saving} onPress={()=>void action.submit(action.failure?.value??!checked)} style={[s.preference,checked&&s.selected,compact&&!!action.failure&&{borderColor:colors.danger}]}>
    {saving?<ActivityIndicator size="small" color={colors.accent}/>:compact&&action.failure?<RotateCcw size={17} color={colors.danger}/>:checked?<Check size={17} color={colors.accent}/>:<Plus size={17} color={colors.text}/>}<Text style={[g.muted,{color:checked?colors.accent:colors.text,fontWeight:'600'}]}>{copy(compact&&action.failure?'groups.responseRetry':'groups.wouldGo')}</Text>
   </OutingPressable><Supporters members={supporters}/>{onOpen&&<OutingPressable testID={testID+'-compare'} accessibilityLabel={copy('groups.compareShort')} onPress={onOpen} style={{minHeight:44,paddingHorizontal:4,justifyContent:'center',marginLeft:'auto'}}><Text style={[g.caption,{color:colors.text}]}>{copy('groups.compareShort')}</Text></OutingPressable>}
  </View>
  {!compact&&<ResponseFailure testID={testID} message={action.failure?.key} disabled={disabled||saving} retry={()=>{if(action.failure)void action.submit(action.failure.value)}}/>}
 </View>;
}

/** Two permanent choices, including withdrawal by tapping the selected one. */
export function AttendanceResponse({plan,group,actor,busy=false,onRespond,getError,testID='group-response',compact=false,onOpen}:{plan:OutingPlan;group?:FriendGroup;actor?:string;busy?:boolean;onRespond:(answer:AttendanceAnswer)=>Promise<unknown>;compact?:boolean;onOpen?:()=>void} & Partial<Omit<SaveFeedback,'disabled'>>){
 const {copy}=usePreferences('copy'),state=decisionState(plan,actor,{group});
 const current=state.current==='yes'||state.current==='no'?state.current:'unanswered';
 const action=useDirectAttendance({current,allowed:state.canVote,busy,scope:plan.id+':'+plan.decisionRound+':'+actor,save:onRespond,getError});
 const shown=action.pending??current,own=plan.members.find(member=>member.userId===actor),ticketLabel=own?.ticketState==='valid'||own?.ticketState==='used'?'groups.myTicket':plan.myPendingPayment?'outings.v2.checkingPayment':'groups.ticketEntry';
 return <View testID={testID+'-poll'} style={{gap:6}}>
  <View testID={testID} style={s.responseRow}>
   <View accessibilityLabel={copy('groups.yourResponse')} style={s.directChoices}>
    {(['yes','no'] as const).map(value=>{const selected=shown===value,pending=action.pending===value,label=copy(value==='yes'?'groups.comingYes':'groups.comingNo');return <OutingPressable key={value} testID={testID+'-'+value} accessibilityRole="checkbox" aria-checked={selected} accessibilityLabel={selected?copy('groups.withdrawResponse')+': '+label:label} accessibilityState={{checked:selected,disabled:action.disabled,busy:pending}} disabled={action.disabled} onPress={()=>void action.choose(value)} style={[s.directAnswer,selected&&s.selected,!!action.failure&&action.failure.value===value&&{borderColor:colors.danger}]}>
     <View style={{position:'absolute',left:6,width:14,height:20,alignItems:'center',justifyContent:'center'}}>{pending?<ActivityIndicator size="small" color={colors.accent}/>:selected?<Check size={15} color={colors.accent}/>:null}</View><Text style={[s.answerLabel,{paddingLeft:14,color:selected?colors.accent:colors.text}]}>{label}</Text>
    </OutingPressable>})}
   </View>
   {!!onOpen&&<OutingPressable testID={testID+'-tickets'} accessibilityLabel={copy(ticketLabel)} disabled={busy} onPress={onOpen} style={s.ticketEntry}><Text style={[g.caption,{color:colors.accent,fontWeight:'600'}]}>{copy(ticketLabel)}</Text><ChevronRight size={15} color={colors.accent}/></OutingPressable>}
  </View>
  <ResponseFailure testID={testID} message={action.failure?.key} disabled={action.disabled||action.pending!==null} retry={()=>void action.retry()}/>
 </View>;
}

export function ProposalPreview({plan,eventId,onOpen,compact=false}:{plan:OutingPlan;eventId:string;onOpen:()=>void;compact?:boolean}){
 const {copy}=usePreferences('copy'),event=plan.options.find(option=>option.eventId===eventId);
 if(!event)return null;
 return <EventPreview variant={compact?'message':'compact'} title={event.title} imageUrl={event.imageUrl} startTime={event.startTime} location={event.location} city={plan.city} onPress={onOpen}>{!compact&&event.totalPriceRon!==undefined&&<Text style={[g.caption,{color:colors.text}]}>{formatRon(event.totalPriceRon)}</Text>}</EventPreview>;
}

export function GroupOutingCard({plan,group,message,actor,busy,onRespond,onToggle,getError,onOpen,onEvent}:{plan?:OutingPlan;group?:FriendGroup;message:GroupMessage;actor?:string;busy:boolean;onRespond:(plan:OutingPlan,answer:AttendanceAnswer)=>Promise<unknown>;onToggle:(plan:OutingPlan,eventId:string,selected:boolean)=>Promise<unknown>;getError?:()=>string|null|undefined;onOpen:()=>void;onEvent:(id:string)=>void}){
 const {copy,language}=usePreferences('copy'),current=isCurrentOutingMessage(message,plan),context=message.outingContext,chosen=plan?.options.find(option=>option.eventId===plan.chosenEventId);
 if(!current)return <OutingPressable testID="group-outing-message-card" accessibilityLabel={copy('groups.viewOuting')} onPress={onOpen} style={s.history}><Text style={[g.caption,{flex:1}]}>{copy('groups.historyChanged',{date:groupNightDate(context?.outingDate,language)||context?.title||copy('groups.viewOuting')})}</Text><ChevronRight size={16} color={colors.muted}/></OutingPressable>;
 return <View testID="group-outing-message-card" style={{width:'100%',gap:12}}>
  {current&&plan?(plan.chosenEventId?<>
   <EventPreview testID={'group-invitation-preview-'+message.id} variant="media" title={chosen?.title??copy('groups.eventUnavailable')} imageUrl={chosen?.imageUrl} startTime={chosen?.startTime} location={chosen?.location} city={plan.city} onPress={onOpen}>
    <AttendanceResponse compact key={plan.id+':'+plan.decisionRound} plan={plan} group={group} actor={actor} busy={busy} onRespond={answer=>onRespond(plan,answer)} getError={getError} onOpen={onOpen} testID="group-chat-response"/>
   </EventPreview>
  </>:<>
   {plan.options.slice(0,2).map(option=><EventPreview key={option.eventId} testID={'group-comparison-preview-'+message.id+'-'+option.eventId} variant="media" title={option.title} imageUrl={option.imageUrl} startTime={option.startTime} location={option.location} city={plan.city} onPress={onOpen}><EventPreference compact plan={plan} group={group} actor={actor} eventId={option.eventId} busy={busy} onToggle={selected=>onToggle(plan,option.eventId,selected)} getError={getError} testID={'group-chat-preference-'+option.eventId}/></EventPreview>)}
   {!plan.options.length&&<Text style={g.muted}>{copy(plan.outingDate?'groups.noEventChosen':'groups.creatorChoosingNight')}</Text>}
  </>):<Text style={g.muted}>{copy('groups.earlierOutingHint')}</Text>}
  {!plan?.chosenEventId&&(!plan?.options.length||plan.options.length>2)&&<OutingPressable testID="group-chat-view-outing" onPress={onOpen} style={s.open}><Text style={[g.caption,{flex:1}]}>{copy('groups.viewOuting')}</Text><ChevronRight size={17} color={colors.muted}/></OutingPressable>}
 </View>;
}
const s=StyleSheet.create({
 card:{gap:8,width:'100%',padding:12,borderRadius:16,backgroundColor:colors.surface},history:{minHeight:44,flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8},
 attendance:{flexDirection:'row',alignItems:'stretch',gap:8},preferenceRow:{flexDirection:'row',alignItems:'center',gap:12,flexWrap:'wrap'},
 answerContents:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,minWidth:0,flexShrink:1},answerState:{width:20,height:20,flexShrink:0,alignItems:'center',justifyContent:'center'},answerLabel:{fontSize:14,lineHeight:20,fontWeight:'600',textAlign:'center',flexShrink:1},
 responseRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:6},directChoices:{flexDirection:'row',alignItems:'stretch',gap:6,flexGrow:1,flexBasis:208},directAnswer:{flex:1,minWidth:0,minHeight:44,paddingHorizontal:8,paddingVertical:9,borderRadius:22,borderWidth:1,borderColor:'transparent',backgroundColor:colors.raised,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:3},ticketEntry:{minHeight:44,marginLeft:'auto',paddingHorizontal:4,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:2},
 preference:{minHeight:44,paddingVertical:10,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:8,borderRadius:22,backgroundColor:colors.raised,borderWidth:1,borderColor:'transparent'},selected:{borderColor:colors.accent,backgroundColor:'#211019'},
 supporters:{flexDirection:'row',alignItems:'center',gap:8},avatars:{flexDirection:'row',alignItems:'center'},error:{flexDirection:'row',gap:8,alignItems:'center'},retry:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},
 open:{minHeight:44,flexDirection:'row',alignItems:'center',gap:12},
});

