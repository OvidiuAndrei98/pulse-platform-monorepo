"use client";
import {useEffect,useRef,useState} from 'react';
import {Check,Plus} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {OutingPlan} from '@packages/app-core/outings/model';
import {GroupActionError,type FriendGroup} from '@packages/app-core/social/groups';
import {decisionState} from '@packages/app-core/social/groupPresentation';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import {ActionButton} from '@/components/ui/ActionButton';
import s from './groups.module.css';

type Attendance='yes'|'no';
type Context={plan:OutingPlan;group?:FriendGroup;actor?:string;disabled?:boolean;testId:string};
/** Selection always comes from the API. Pending requests never fake a saved response. */
function useResponse<T>(scope:string,enabled:boolean,onChange:(value:T)=>Promise<unknown>|void){
 const [pending,setPending]=useState<T>(),[failed,setFailed]=useState(''),submitting=useRef(false);
 useEffect(()=>setFailed(''),[scope]);
 const choose=async(value:T)=>{if(!enabled||submitting.current)return;submitting.current=true;setFailed('');setPending(value);try{const result=await onChange(value);if(result===false||result===undefined)setFailed('groups.responseSaveError')}catch(error){setFailed(error instanceof GroupActionError?error.key:'groups.responseSaveError')}finally{submitting.current=false;setPending(undefined)}};
 return {pending,failed,choose};
}
export function DecisionPoll({plan,group,actor,onChange,disabled,testId}:Context&{onChange:(value:Attendance)=>Promise<unknown>|void}){
 const {t}=useTranslation(),state=decisionState(plan,actor,{group}),{pending,failed,choose}=useResponse(plan.id+':'+plan.decisionRound,!disabled&&state.canVote&&!!plan.chosenEventId,onChange);
 const choices=state.choices.filter(choice=>choice.value!=='maybe'),question=t('groups.comingQuestion');
 return <section className={s.decisionPoll} data-testid={testId} data-value={state.current??''} aria-label={question}>
  <div className={s.pollHeading}><h2>{question}</h2></div>
  <div className={s.attendanceActions} role="group" aria-label={question}>{choices.map(choice=><ActionButton type="button" tone={choice.value==='yes'?'primary':'secondary'} key={choice.value} data-testid={testId+'-'+choice.value} aria-pressed={state.current===choice.value} busy={pending===choice.value} disabled={disabled||!state.canVote||pending!==undefined} onClick={()=>{if(state.current!==choice.value)void choose(choice.value as Attendance)}}>
   {state.current===choice.value&&pending!==choice.value&&<Check size={16} aria-hidden/>}{t(choice.value==='yes'?'groups.comingYes':'groups.comingNo')}
  </ActionButton>)}</div>
  <p className={s.pollMeta} aria-live="polite">{t('groups.comingCount',{count:choices.find(choice=>choice.value==='yes')?.count??0})}{state.eligible>state.answered?' · '+t('groups.notAnsweredCount',{count:state.eligible-state.answered}):''}{state.pending?' · '+t('groups.invitedCount',{count:state.pending}):''}{state.closed?' · '+t('groups.decisionClosed'):''}</p>
  {failed&&<p className={s.error} role="alert">{t(failed)}</p>}
 </section>;
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
