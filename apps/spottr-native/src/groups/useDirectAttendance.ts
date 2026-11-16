import {useEffect,useRef,useState} from 'react';
import {GroupActionError} from '@packages/app-core/social/groups';
export type AttendanceAnswer='yes'|'no'|'unanswered';

/** One request at a time. A rapid tap replaces only the queued intent, never
 * races the current request or lets an older acknowledgement win visually. */
export function useDirectAttendance({current,allowed,busy,scope,save,getError}:{current:AttendanceAnswer;allowed:boolean;busy:boolean;scope:string;save:(value:AttendanceAnswer)=>Promise<unknown>;getError?:()=>string|null|undefined}){
 const [pending,setPending]=useState<AttendanceAnswer|null>(null),[failure,setFailure]=useState<{value:AttendanceAnswer;key:string}|null>(null);
 const alive=useRef(true),working=useRef(false),desired=useRef<AttendanceAnswer|null>(null),shown=useRef(current),confirmed=useRef(current),latest=useRef({allowed,busy,scope,save,getError});
 latest.current={allowed,busy,scope,save,getError};if(!working.current){shown.current=current;confirmed.current=current}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;desired.current=null}},[]);
 const submit=async(value:AttendanceAnswer)=>{
  if(!alive.current||!latest.current.allowed||latest.current.busy&&!working.current)return;
  desired.current=value;shown.current=value;setPending(value);setFailure(null);
  if(working.current)return;
  working.current=true;const requestScope=latest.current.scope;
  try{
   while(alive.current&&desired.current!==null&&latest.current.allowed&&latest.current.scope===requestScope){
    const answer=desired.current;desired.current=null;
    if(answer===confirmed.current)continue;
    try{const result=await latest.current.save(answer);if(!result)throw new GroupActionError(latest.current.getError?.()??'groups.responseSaveError');confirmed.current=answer}
    catch(error){
     if(!alive.current||latest.current.scope!==requestScope)return;
     const key=error instanceof GroupActionError?error.key:latest.current.getError?.()??'groups.responseSaveError';
     // A new round or revoked membership must not replay a queued old answer.
     if(['groups.responseContextChanged','groups.contextStale','groups.accessLost','groups.sessionEnded','groups.invitationPending'].includes(key))desired.current=null;
     if(desired.current===null){setFailure({value:answer,key});shown.current=confirmed.current;break}
    }
   }
  }finally{working.current=false;desired.current=null;if(alive.current){setPending(null)}}
 };
 const choose=(value:'yes'|'no')=>submit(shown.current===value?'unanswered':value);
 return {pending,failure,choose,retry:()=>failure?submit(failure.value):Promise.resolve(),disabled:!allowed||busy&&!working.current};
}
