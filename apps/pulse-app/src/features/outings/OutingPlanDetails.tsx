"use client";
import { useState } from 'react';
import { Check,LockKeyhole,MapPin,Plus,Share2,Ticket,UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { optionVoters } from '@packages/app-core/outings/presentation';
import type { OutingPlan } from '@packages/app-core/outings/model';
import { ActionButton,ActionLink,IconButton } from '@/components/ui/ActionButton';
import { ModalFrame,ModalHeader } from '@/components/ui/ModalFrame';
import { routeForPlatform } from '@/lib/native/navigation';
import { formatEventTime } from '@/features/events/dateFormat';
import { PlanProposals } from './PlanProposals';
import { DateBlock,MemberAvatar,OutingBadge,OutingEmpty,OutingMeta,OutingProgress } from './OutingPrimitives';
import type { useOutings } from './useOutings';
import s from './outings.module.css';

export function OutingPlanDetails({plan,model}:{plan:OutingPlan;model:ReturnType<typeof useOutings>}) {
  const {t,i18n}=useTranslation(),accepted=plan.status==='accepted',actor=model.user?.properties.id;
  const [adding,setAdding]=useState(!plan.options.length),[confirmation,setConfirmation]=useState<string|null>(null);
  const mine=plan.members.find(member=>member.userId===actor),members=plan.members.filter(member=>member.status==='accepted');
  const amount=(value:number)=>new Intl.NumberFormat(i18n.language,{maximumFractionDigits:2}).format(value);
  const share=async()=>{
    const url=new URL('/outings',location.origin);url.searchParams.set('plan',plan.id);
    try{if(navigator.share)await navigator.share({title:plan.title,url:url.href});else await navigator.clipboard.writeText(url.href);}
    catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))toast.error(t('feedback.shareFailed'));}
  };
  const choice=plan.options.find(option=>option.eventId===confirmation);
  const confirm=async()=>{if(!choice||model.working||plan.ownerId!==actor)return;if(await model.store.choose(plan.id,choice.eventId))setConfirmation(null);};
  const eventLink=(id:string)=>routeForPlatform('/events/'+id);
  return <>
    <header className={s.hero}>
      <div className={s.split}><p className={s.eyebrow}><LockKeyhole size={14} aria-hidden/>{t('outings.ui.private')}</p>
        <IconButton label={t('outings.share')} disabled={model.working} onClick={()=>void share()}><Share2 size={18} aria-hidden/></IconButton></div>
      <h1 tabIndex={-1} className={s.title}>{plan.title}</h1><div style={{marginTop:16}}><OutingMeta plan={plan}/></div>
    </header>
    {!accepted?<div className={s.section}><div className={s.stack}>
      <h2 className="text-xl font-semibold">{t('outings.ui.invitationTitle')}</h2><p className={s.muted}>{t('outings.ui.invitationBody')}</p>
      <div className={s.actions}><ActionButton busy={model.working} onClick={()=>void model.store.respondPlan(plan.id,'accepted')}>{t('outings.accept')}</ActionButton><ActionButton tone="secondary" disabled={model.working} onClick={()=>void model.store.respondPlan(plan.id,'declined')}>{t('outings.decline')}</ActionButton></div>
    </div></div>:<>
      <OutingProgress plan={plan}/>
      <div className={s.layout}>
        <div className={s.main}>
          <div className={s.sectionHeader}><div><h2>{t(plan.chosenEventId?'outings.ui.chosenDate':'outings.events')}</h2><p className={s.muted}>{t(plan.chosenEventId?'outings.ui.preparationHint':'outings.ui.proposalHint')}</p></div>
            {!plan.chosenEventId&&<span className={s.pill}>{t('outings.ui.proposalsCount',{count:plan.options.length})}</span>}</div>
          {!plan.options.length&&!adding&&<OutingEmpty title={t('outings.noProposals')} detail={t('outings.ui.proposeEmpty')}/>}
          {plan.chosenEventId&&<section className={s.section}><div className={s.sectionHeader}><h2 className={s.meta}><Ticket size={20} aria-hidden/>{t('outings.ticketsReady')}</h2></div>
            <div className={s.stack}><p className={s.muted}>{t(mine?.hasTicket?'outings.ui.readyHint':'outings.ui.needTicketHint')}</p>
              {mine?.hasTicket?<><ActionLink href={routeForPlatform('/events/'+plan.chosenEventId+'/night')}>{t('outings.night')}</ActionLink><ActionLink tone="secondary" href={routeForPlatform('/events/'+plan.chosenEventId+'/group')}>{t('outings.openGroup')}</ActionLink></>:<ActionLink href={eventLink(plan.chosenEventId)}>{t('outings.buyTicket')}</ActionLink>}
              <p className={s.muted}>{t('outings.chosenHint')}</p>
            </div>
          </section>}
          {plan.options.map(event=>{
            const voters=optionVoters(plan,event.eventId),voted=mine?.voteEventId===event.eventId,chosen=plan.chosenEventId===event.eventId;
            return <article key={event.eventId} className={s.proposal} data-chosen={chosen}>
              {chosen&&<OutingBadge tone="success"><Check size={14} aria-hidden/>{t('outings.chosen')}</OutingBadge>}
              <div className={s.proposalBody}><DateBlock day={plan.outingDate}/><div className={s.proposalText}>
                <h3>{event.title}</h3><p className={s.meta}><MapPin size={14} aria-hidden/>{event.location} · {formatEventTime(event.startTime)}</p>
                {event.priceRon!==undefined&&event.ticketAvailability!=='external'&&<p className={s.price}>{event.priceRon===0?t('outings.free'):t('outings.priceFrom',{amount:amount(event.priceRon)})}</p>}
              </div></div>
              {event.ticketAvailability&&<p className={s.muted}>{t('outings.availability.'+event.ticketAvailability)}</p>}
              {!event.available&&<p className={s.muted}>{t('outings.unavailable')}</p>}
              {!plan.chosenEventId&&<><div className={s.voteLine}><div className={s.meta}><span className={s.people} aria-hidden>{voters.slice(0,3).map(member=><MemberAvatar key={member.userId} name={member.username}/>)}</span>
                <span>{t(voters.length?'outings.votes':'outings.ui.noVotes',{count:voters.length})}</span></div>{voted&&<span className={s.meta}><Check size={15} aria-hidden/>{t('outings.ui.voted')}</span>}</div>
              <div className={s.voteTrack} aria-hidden><span style={{width:(members.length?voters.length/members.length*100:0)+'%'}}/></div></>}
              <div className={s.actions}>
                {!plan.chosenEventId&&event.available&&<>
                  <ActionButton data-testid={'outing-vote-'+event.eventId} aria-pressed={voted} tone="secondary" disabled={model.working} onClick={()=>void model.store.vote(plan.id,event.eventId)}>{voted&&<Check size={16} aria-hidden/>}{t(voted?'outings.ui.voted':'outings.vote')}</ActionButton>
                  {plan.ownerId===actor&&<ActionButton tone="ghost" disabled={model.working} onClick={()=>setConfirmation(event.eventId)}>{t('outings.choose')}</ActionButton>}
                </>}
                <ActionLink tone="ghost" href={eventLink(event.eventId)}>{t('outings.viewEvent')}</ActionLink>
              </div>
            </article>;
          })}
          {!plan.chosenEventId&&plan.outingDate&&plan.city&&<>
            <ActionButton tone={plan.options.length?'secondary':'primary'} aria-expanded={adding} disabled={model.working||plan.options.length>=8} onClick={()=>setAdding(value=>!value)}><Plus size={18} aria-hidden/>{t('outings.propose')}</ActionButton>
            {adding&&<PlanProposals plan={plan} model={model} onProposed={()=>setAdding(false)}/>}
          </>}
          {!plan.chosenEventId&&(!plan.outingDate||!plan.city)&&<p className={s.muted}>{t('outings.legacyContext')}</p>}

        </div>
        <aside className={s.side}><section className={s.section}><div className={s.sectionHeader}><h2 className={s.meta}><UsersRound size={20} aria-hidden/>{t('outings.ui.participants')}</h2><span className={s.pill}>{plan.members.length}</span></div>
          {plan.members.map(member=><div key={member.userId} className={s.memberRow}><MemberAvatar name={member.username}/><div className={s.memberInfo}><strong>{member.username}</strong><span>{t(plan.chosenEventId&&member.status==='accepted'?(member.hasTicket?'outings.hasTicket':'outings.needsTicket'):'outings.'+member.status)}</span></div>{plan.chosenEventId&&member.hasTicket&&<Check size={16} aria-hidden/>}</div>)}
          <p className={s.muted}>{t(plan.chosenEventId?'outings.ticketPrivacy':'outings.ui.privacyHint')}</p>
        </section></aside>
      </div>
    </>}
    <ModalFrame open={!!choice} onClose={()=>setConfirmation(null)} label={t('outings.ui.confirmChoice')} dismissible={!model.working} testId="outing-confirm-dialog">
      <ModalHeader title={t('outings.ui.confirmChoice')} onClose={()=>setConfirmation(null)} disabled={model.working}/>
      <div className="space-y-5 p-6"><p>{t('outings.ui.confirmChoiceHint',{event:choice?.title})}</p><div className={s.actions}>
        <ActionButton tone="secondary" data-dialog-initial-focus disabled={model.working} onClick={()=>setConfirmation(null)}>{t('common.cancel')}</ActionButton>
        <ActionButton data-testid="outing-confirm-choice" busy={model.working} onClick={()=>void confirm()}>{t('outings.ui.confirmDestination')}</ActionButton>
      </div></div>
    </ModalFrame>
  </>;
}
