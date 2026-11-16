"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Check,Loader2,Plus} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {OutingPlan} from '@packages/app-core/outings/model';
import {GroupActionError,type FriendGroup} from '@packages/app-core/social/groups';
import {decisionState} from '@packages/app-core/social/groupPresentation';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import {ActionButton} from '@/components/ui/ActionButton';
import s from './groups.module.css';

type Attendance='yes'|'no'|'unanswered';
type Context={plan:OutingPlan;group?:FriendGroup;actor?:string;disabled?:boolean;testId:string};
/** Selection always comes from the API. Pending requests never fake a saved response. */
function useResponse<T>(scope:string,enabled:boolean,onChange:(value:T)=>Promise<unknown>|void){
 const [pending,setPending]=useState<T>(),[failed,setFailed]=useState(''),submitting=useRef(false);
 useEffect(()=>setFailed(''),[scope]);
 const choose=async(value:T)=>{if(!enabled||submitting.current)return false;submitting.current=true;setFailed('');setPending(value);try{const result=await onChange(value);if(result===false||result===undefined){setFailed('groups.responseSaveError');return false}return true}catch(error){setFailed(error instanceof GroupActionError?error.key:'groups.responseSaveError');return false}finally{submitting.current=false;setPending(undefined)}};
 return {pending,failed,choose};
}
export function DecisionPoll({plan,group,actor,onChange,disabled,testId,heading=false,action}:Context&{onChange:(value:Attendance)=>Promise<unknown>|void;heading?:boolean;action?:ReactNode}){
 const {t}=useTranslation(),state=decisionState(plan,actor,{group}),scope=plan.id+':'+plan.decisionRound+':'+actor;
 const current:Attendance=state.current==='yes'||state.current==='no'?state.current:'unanswered';
 const {selected,pending,failed,toggle}=useAttendanceResponse(scope,current,state.canVote&&!!plan.chosenEventId,!!disabled,onChange);
 const choices=state.choices.filter(choice=>choice.value!=='maybe'),question=t('groups.comingQuestion');
 return <section className={s.decisionPoll} data-testid={testId} data-value={current==='unanswered'?'':current} aria-label={question}>
  {heading&&<div className={s.pollHeading}><h2>{t('groups.yourResponse')}</h2></div>}
  <div className={s.attendanceBar}><div className={s.attendanceActions} role="group" aria-label={question}>{choices.map(choice=>{const active=selected===choice.value,label=t(choice.value==='yes'?'groups.comingYes':'groups.comingNo');return <button type="button" className={s.attendanceChoice} key={choice.value} data-testid={testId+'-'+choice.value} aria-pressed={active} aria-label={active?label+' · '+t('groups.withdrawResponse'):label} disabled={!state.canVote||!!disabled&&!pending} onClick={()=>toggle(choice.value as 'yes'|'no')}>
   <span className={s.attendanceMark} aria-hidden>{pending&&active?<Loader2 size={14} className="ui-spinner"/>:active?<Check size={14}/>:null}</span><span>{label}</span>
  </button>})}</div>{action&&<span className={s.responseAction}>{action}</span>}</div>
  {pending&&<span className="sr-only" role="status">{t('groups.responseSaving')}</span>}
  {failed&&<p className={s.error} role="alert">{t(failed)}</p>}
 </section>;
}

/** Only one server write runs at a time. Further taps replace the queued intent;
 * a failed write restores the last acknowledged selection instead of hiding it. */
function useAttendanceResponse(scope:string,current:Attendance,enabled:boolean,busy:boolean,onChange:(value:Attendance)=>Promise<unknown>|void){
 const [desired,setDesired]=useState<Attendance>(),[failed,setFailed]=useState(''),[cycle,setCycle]=useState(0);
 const ref=useRef({scope,confirmed:current,desired:undefined as Attendance|undefined,running:false,alive:true});
 const latest=useRef({enabled,busy,onChange});latest.current={enabled,busy,onChange};
 if(ref.current.scope===scope&&!ref.current.running)ref.current.confirmed=current;
 useEffect(()=>{ref.current={scope,confirmed:current,desired:undefined,running:false,alive:true};setDesired(undefined);setFailed('');return()=>{ref.current.alive=false}},[scope]);
 useEffect(()=>{
  const state=ref.current;if(state.scope!==scope||!state.alive||state.running||state.desired===undefined||latest.current.busy)return;
  if(!latest.current.enabled){state.desired=undefined;setDesired(undefined);return}
  if(state.desired===state.confirmed){state.desired=undefined;setDesired(undefined);return}
  const value=state.desired;state.running=true;
  void(async()=>{try{const result=await latest.current.onChange(value);if(!state.alive||state!==ref.current)return;if(result===false||result===undefined)throw new Error('RESPONSE_NOT_SAVED');state.confirmed=value}catch(error){if(!state.alive||state!==ref.current)return;state.desired=undefined;setDesired(undefined);setFailed(error instanceof GroupActionError?error.key:'groups.responseSaveError')}finally{state.running=false;if(!state.alive||state!==ref.current)return;if(state.desired===state.confirmed){state.desired=undefined;setDesired(undefined)}setCycle(value=>value+1)}})();
 },[scope,desired,busy,enabled,cycle]);
 const toggle=(value:'yes'|'no')=>{const state=ref.current;if(!latest.current.enabled||latest.current.busy&&!state.running&&state.desired===undefined)return;const selected=state.desired??state.confirmed;state.desired=selected===value?'unanswered':value;setFailed('');setDesired(state.desired)};
 return {selected:desired??current,pending:desired!==undefined,failed,toggle};
}

/** Independent support for an event; choosing the destination is a separate owner action. */
export function EventPreference({plan,group,actor,eventId,onChange,disabled,testId}:Context&{eventId:string;onChange:(supported:boolean)=>Promise<unknown>|void}){
 const {t}=useTranslation(),state=decisionState(plan,actor,{group,eventId}),support=state.choices.find(choice=>choice.value==='yes')!,selected=state.current==='yes';
 const {pending,failed,choose}=useResponse(plan.id+':'+plan.decisionRound+':'+eventId,!disabled&&state.canVote,onChange);
 return <div className={s.eventPreference} data-testid={testId} data-value={selected?'yes':''}>
  <div className={s.supportRow}><ActionButton type="button" tone="secondary" data-testid={testId+'-toggle'} aria-pressed={selected} busy={pending!==undefined} disabled={disabled||!state.canVote||pending!==undefined} onClick={()=>void choose(!selected)}>
   {pending===undefined&&(selected?<Check size={16} aria-hidden/>:<Plus size={16} aria-hidden/>)}{t('groups.wouldGo')}
  </ActionButton>
   {!!support.members.length&&<><span className={s.choiceAvatars} aria-hidden>{support.members.slice(0,3).map(member=><MemberAvatar key={member.userId} name={member.username} uri={member.avatarUrl} userId={member.userId}/>)}</span><span className={s.choiceCount}>{support.count}</span></>}
  </div>
  {failed&&<p className={s.error} role="alert">{t(failed)}</p>}
 </div>;
}
