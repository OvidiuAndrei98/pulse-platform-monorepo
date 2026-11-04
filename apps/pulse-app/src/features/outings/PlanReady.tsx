"use client";
import { useEffect,useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient,type ReadableSchema } from '@packages/api-client/client';
import { eventNightTickets,type OutingPlan } from '@packages/app-core/outings/model';
import { arrivalStates,planNightEnded } from '@packages/app-core/outings/presentation';
import { useCachedClientQuery } from '@/lib/useCachedClientQuery';
import { TicketPreview } from '@/components/tickets/TicketPreview';
import { ActionButton,ActionLink } from '@/components/ui/ActionButton';
import { Field,Input } from '@/components/ui/Field';
import { ModalFrame,ModalHeader } from '@/components/ui/ModalFrame';
import { ThemedSelect } from '@/features/events/form/ThemedSelect';
import { routeForPlatform } from '@/lib/native/navigation';
import { formatEventDate,formatEventTime } from '@/features/events/dateFormat';
import type { useOutings } from './useOutings';
import s from './outings.module.css';

export function PlanReady({plan,model}:{plan:OutingPlan;model:ReturnType<typeof useOutings>}) {
 const {t}=useTranslation(),actor=model.user?.properties.id;
 const tickets=useCachedClientQuery<ReadableSchema<'UserTicketResponse'>[]>(actor?'night-tickets:'+actor:null,()=>ApiClient.instance.get('/users/me/tickets',{cache:'no-store'}),[]);
 const owned=eventNightTickets(tickets.data,plan.chosenEventId!),[selected,setSelected]=useState(''),ticket=owned.find(ticket=>ticket.id===selected);
 const [meetingEdit,setMeetingEdit]=useState(false);
 const [planB,setPlanB]=useState(false),[reason,setReason]=useState('sold_out'),[place,setPlace]=useState(plan.meetingPoint??''),[meeting,setMeeting]=useState(plan.meetingAt??'');
 useEffect(()=>{setPlace(plan.meetingPoint??'');setMeeting(plan.meetingAt??'');},[plan.meetingPoint,plan.meetingAt]);
 const event=plan.options.find(e=>e.eventId===plan.chosenEventId),mine=plan.members.find(m=>m.userId===actor),owner=plan.ownerId===actor;
 const time=(at:string)=>formatEventDate(at)+' · '+formatEventTime(at);
 const ended=planNightEnded(plan);
 return <>
  <section className={s.readyCard}>
   {event?.imageUrl&&<img src={event.imageUrl} alt="" className={s.readyImage}/>}
   <div className={s.readyBody}><span className={s.eyebrow}>{t('outings.plan.ready')}</span><h2>{event?.title}</h2><p className={s.muted}>{event?.location} · {event&&time(event.startTime)}</p>
    {ended?<ActionLink href={routeForPlatform('/events/'+plan.chosenEventId)}>{t('outings.viewEvent')}</ActionLink>:mine?.hasTicket?<ActionButton busy={tickets.pending} disabled={!owned.length} onClick={()=>setSelected(owned.find(ticket=>!ticket.isValidated)?.id??owned[0]!.id)}>{t('outings.plan.ticket')}</ActionButton>:<ActionLink href={routeForPlatform('/events/'+plan.chosenEventId)}>{t('outings.buyTicket')}</ActionLink>}
    {!!tickets.error&&<ActionButton tone="secondary" onClick={tickets.retry}>{t('common.retry')}</ActionButton>}
    <ActionLink tone="secondary" href={routeForPlatform('/events/'+plan.chosenEventId+'/night')}>{t('outings.plan.night')}</ActionLink><p className={s.muted}>{t('outings.plan.ticketHint')}</p>
   </div>
  </section>
  <section className={s.journeySection}><div className={s.formFields}><h2>{t('outings.plan.meetup')}</h2>
   <p>{plan.meetingPoint||t('outings.plan.noMeeting')}</p>{plan.meetingAt&&<p className={s.muted}>{time(plan.meetingAt)}</p>}{owner&&!ended&&<ActionButton tone="ghost" onClick={()=>setMeetingEdit(true)}>{t('outings.plan.edit')}</ActionButton>}

  </div></section>
  <section className={s.journeySection}><div className={s.formFields}><Field label={t('outings.plan.myStatus')}><ThemedSelect testId="outing-arrival" value={mine?.arrivalStatus??'not_set'} placeholder={t('outings.plan.not_set')} disabled={model.working||ended} onChange={status=>void model.store.updatePlan(plan.id,'arrival',{status})} options={arrivalStates.map(value=>({value,label:t('outings.plan.'+value)}))}/></Field><p className={s.muted}>{t('outings.plan.statusHint')}</p></div></section>
  {owner&&<ActionButton tone="secondary" disabled={model.working} onClick={()=>setPlanB(true)}>{t('outings.plan.planB')}</ActionButton>}
  <ModalFrame open={meetingEdit} onClose={()=>setMeetingEdit(false)} label={t('outings.plan.meetup')} dismissible={!model.working}><ModalHeader title={t('outings.plan.meetup')} onClose={()=>setMeetingEdit(false)} disabled={model.working}/><div className="space-y-5 p-6"><Field label={t('outings.plan.place')}><Input data-testid="outing-meeting" maxLength={160} value={place} disabled={model.working} onChange={event=>setPlace(event.target.value)}/></Field><Field label={t('outings.plan.meetingTime')}><Input type="datetime-local" value={meeting?new Date(Date.parse(meeting)-new Date(meeting).getTimezoneOffset()*60000).toISOString().slice(0,16):''} disabled={model.working} onChange={event=>setMeeting(event.target.value?new Date(event.target.value).toISOString():'')}/></Field><ActionButton busy={model.working} onClick={()=>void model.store.updatePlan(plan.id,'meeting',{place,at:meeting||undefined}).then(ok=>{if(ok)setMeetingEdit(false);})}>{t('outings.plan.saveMeeting')}</ActionButton></div></ModalFrame>
  <ModalFrame open={planB} onClose={()=>setPlanB(false)} label={t('outings.plan.planB')} dismissible={!model.working}><ModalHeader title={t('outings.plan.planB')} onClose={()=>setPlanB(false)} disabled={model.working}/><div className="space-y-5 p-6"><p>{t('outings.plan.planBHint')}</p><ThemedSelect value={reason} placeholder={t('outings.plan.other')} onChange={setReason} options={['sold_out','cancelled','other'].map(value=>({value,label:t('outings.plan.'+value)}))}/><div className={s.actions}><ActionButton tone="secondary" data-dialog-initial-focus disabled={model.working} onClick={()=>setPlanB(false)}>{t('common.cancel')}</ActionButton><ActionButton busy={model.working} onClick={()=>void model.store.updatePlan(plan.id,'reopen',{revision:plan.revision,reason}).then(ok=>{if(ok)setPlanB(false);})}>{t('outings.plan.reopen')}</ActionButton></div></div></ModalFrame>
  {ticket&&<TicketPreview ticket={ticket} tickets={owned} onSelect={ticket=>setSelected(ticket.id)} onClose={()=>setSelected('')}/>}
 </>;
}
