"use client";
import Link from 'next/link';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {GroupMessage} from '@packages/app-core/social/groups';
import {groupNightDate,groupUpdateSummary,outingTitle} from '@packages/app-core/social/groupPresentation';
import {ActionButton} from '@/components/ui/ActionButton';
import s from './groups.module.css';

export function GroupUpdate({message,previous,groupId,link=true,inline=false}:{message:GroupMessage;previous?:GroupMessage;groupId:string;link?:boolean;inline?:boolean}){
 const {t,i18n}=useTranslation(),text=groupUpdateSummary(message,previous,i18n.language,t);
 const content=<><span>{text}</span><time dateTime={message.createdAt}>{new Intl.DateTimeFormat(i18n.language,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(message.createdAt))}</time></>;
 return inline?<p data-testid="group-outing-update" className={s.compactUpdate} data-message-id={message.id}>{content}</p>:link?<Link data-testid="group-outing-update" data-message-id={message.id} className={s.compactUpdate} href={'/groups/'+groupId+'/outings/'+message.outingId+'?history='+encodeURIComponent(message.id)}>{content}</Link>:<li className={s.compactUpdate} data-message-id={message.id}>{content}</li>;
}

export function OutingAudit({messages,groupId,planId,more,onLoad,expanded=false}:{messages:GroupMessage[];groupId:string;planId:string;more?:boolean;onLoad:(older?:boolean)=>void;expanded?:boolean}){
 const {t,i18n}=useTranslation(),[visible,setVisible]=useState(20),ordered=[...messages].sort((a,b)=>a.seq-b.seq),bySeq=new Map(ordered.map(message=>[message.seq,message]));
 const entries=ordered.filter(message=>message.outingId===planId&&message.kind==='outing');
 const content=<><ol className={s.auditEntries}>{entries.slice(-visible).map(message=>{
  const context=message.outingContext,selectedEvent=ordered.find(item=>item.event?.id===context?.chosenEventId)?.event;
  const description=context?[context.title&&!/^\d{4}-\d{2}-\d{2}$/.test(context.title)?outingTitle(context,i18n.language):undefined,context.outingDate?groupNightDate(context.outingDate,i18n.language):context.candidateDates.map(day=>groupNightDate(day,i18n.language)).join(' · '),context.city,selectedEvent?.title].filter(Boolean).join(' · '):undefined;
  return <li key={message.id} className={s.auditEntry} data-message-id={message.id}><GroupUpdate message={message} previous={bySeq.get(message.seq-1)} groupId={groupId} inline/>{description&&<p className={s.auditSnapshot}>{description}</p>}{message.content&&<p className={s.auditSnapshot}>{message.content}</p>}<time className={s.auditDate} dateTime={message.createdAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium'}).format(new Date(message.createdAt))}</time></li>;
 })}</ol>{(more||entries.length>visible)&&<ActionButton tone="ghost" size="compact" onClick={()=>{setVisible(value=>value+20);if(entries.length<=visible)onLoad(true)}}>{t('groups.older')}</ActionButton>}</>;
 return expanded?<section data-testid="group-outing-audit">{content}</section>:<details className={s.auditDetails} data-testid="group-outing-audit" onToggle={event=>{if(event.currentTarget.open)onLoad()}}><summary>{t('groups.historyDetails')}</summary>{content}</details>;
}
