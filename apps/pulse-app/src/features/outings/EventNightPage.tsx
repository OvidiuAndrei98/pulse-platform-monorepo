"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useEventNight } from './useEventNight';
import { HoldForHelp } from './HoldForHelp';
import { ActionButton } from '@/components/ui/ActionButton';
import { TicketPreview } from '@/components/tickets/TicketPreview';
import { useWardrobe } from '@/features/wardrobe/useWardrobe';
import { itemsText, pickupActive } from '@packages/app-core/wardrobe/model';
import { formatEventDate, formatEventTime } from '@/features/events/dateFormat';
import { routeForPlatform } from '@/lib/native/navigation';
import { MeetingPoint } from './MeetingPoint';
import { useDataProvider } from '@/core/DataProviderContext';

export default function EventNightPage() {
  const params=useParams<{id:string}>(),search=useSearchParams(),eventId=params.id==='mobile'?search.get('eventId')??'':params.id;
  const {user}=useDataProvider();return <EventNightContent key={eventId+':'+(user?.properties.id??'guest')} eventId={eventId}/>;
}
function EventNightContent({eventId}:{eventId:string}) {
  const model=useEventNight(eventId),wardrobe=useWardrobe(false,10_000),{t,i18n}=useTranslation(),[selected,setSelected]=useState('');
  const group=model.group.data?.group,ticket=model.owned.find(t=>t.id===selected),deposits=wardrobe.state.mine?.deposits.filter(d=>d.eventId===eventId)??[];
  return <main data-testid="event-night" className="mx-auto w-full max-w-3xl space-y-5 px-5 py-6 pb-32">
    <Link href="/users/me" className="inline-flex min-h-11 items-center text-muted-foreground">← {t('common.back')}</Link>
    <h1 className="text-3xl font-bold">{t('eventNight.title')}</h1>
    {!model.user?<Link href="/login">{t('nav.profile')}</Link>:model.tickets.pending||model.event.pending?<p role="status">{t('common.loading')}</p>:model.tickets.error||model.event.error?<ActionButton onClick={()=>{model.tickets.retry();model.event.retry();}}>{t('common.retry')}</ActionButton>:!model.owned.length?<p>{t('eventNight.noTicket')}</p>:<>
      <h2 className="text-2xl font-bold">{model.event.data?.title}</h2><p className="text-muted-foreground">{formatEventDate(model.owned[0]!.startTime)} · {formatEventTime(model.owned[0]!.startTime)} · {model.owned[0]!.locationName}</p>
      <ActionButton data-testid="night-ticket" onClick={()=>setSelected(model.owned.find(t=>!t.isValidated)?.id??model.owned[0]!.id)}>{t('eventNight.ticket')}</ActionButton>
      <NightSection title={t('eventNight.group')}>
        {Boolean(model.group.error)&&<p role="alert">{t('safetyGroup.loadFailed')}</p>}{model.error&&<p role="alert">{t(model.error)}</p>}
        {group?.currentMemberStatus==='accepted'&&<><MeetingPoint value={group.meetingPoint??''} editable={group.ownerId===model.user?.properties.id} busy={model.busy} onSave={model.saveMeeting}/><p>{group.members.filter(m=>m.status==='accepted').map(m=>m.username).join(' · ')}</p>
          {group.currentUserNeedsHelp?<ActionButton disabled={model.busy} onClick={()=>void model.help(true)}>{t('safetyGroup.iAmSafe')}</ActionButton>:<HoldForHelp disabled={!group.canSendHelp||model.busy} onComplete={()=>model.help()}/>}
          {!group.canSendHelp&&<p className="text-sm text-muted-foreground">{t('safetyGroup.helpAfterValidation')}</p>}</>}
        <p className="text-sm text-muted-foreground">{t('eventNight.groupHint')}</p><Link className="inline-flex min-h-11 items-center text-primary underline" href={routeForPlatform('/events/'+eventId+'/group')}>{t('eventNight.openGroup')}</Link>
      </NightSection>
      <NightSection title={t('eventNight.wardrobe')}>
        {deposits.map(d=><div key={d.id} className="space-y-3"><p className="font-semibold">{d.zoneName} · {d.number}</p><p>{itemsText(d.remaining,i18n.language.startsWith('ro'))}</p>
          {pickupActive(d)&&!d.pickupApproved&&<><p>{t('wardrobe.confirmHint')}</p><ActionButton disabled={wardrobe.state.busy} onClick={()=>void wardrobe.store.approve(d,true)}>{t('wardrobe.approve')}</ActionButton><ActionButton tone="secondary" disabled={wardrobe.state.busy} onClick={()=>void wardrobe.store.approve(d,false)}>{t('wardrobe.decline')}</ActionButton></>}
        </div>)}{!deposits.length&&<p className="text-muted-foreground">{t('wardrobe.empty')}</p>}{Boolean(wardrobe.state.error)&&<p role="alert">{t('wardrobe.error')}</p>}
        <Link className="inline-flex min-h-11 items-center text-primary underline" href="/wardrobe">{t('wardrobe.open')}</Link>
      </NightSection>
      <NightSection title={t('eventNight.program')}>
        {model.event.data?.lineup.length?model.event.data.lineup.map((artist,index)=><div key={artist.name+index}><p className="font-semibold">{artist.name}</p><p className="text-muted-foreground">{[artist.performanceTime,artist.stage].filter(Boolean).join(' · ')}</p></div>):<p className="text-muted-foreground">{t('eventNight.noProgram')}</p>}
      </NightSection>
      <NightSection title={t('eventNight.updates')}>
        {model.updates.error?<ActionButton tone="secondary" onClick={model.updates.retry}>{t('common.retry')}</ActionButton>:model.updates.data.length?model.updates.data.map(update=><p key={update.id}>{update.caption}</p>):<p className="text-muted-foreground">{t('eventNight.noUpdates')}</p>}
      </NightSection>
      <Link className="inline-flex min-h-11 items-center text-primary underline" href={routeForPlatform('/events/'+eventId)}>{t('eventNight.details')}</Link>
    </>}
    {ticket&&<TicketPreview ticket={ticket} tickets={model.owned} onSelect={t=>setSelected(t.id)} onClose={()=>setSelected('')}/>}
  </main>;
}
function NightSection({title,children}:{title:string;children:React.ReactNode}) {return <section className="space-y-4 rounded-3xl border border-white/10 p-5"><h2 className="text-xl font-semibold">{title}</h2>{children}</section>;}
