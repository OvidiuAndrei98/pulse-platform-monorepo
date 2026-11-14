"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Check,Plus} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {GROUP_MEMBER_LIMIT,type FriendGroup} from '@packages/app-core/social/groups';
import {planningToday,validPlanningDate,matchesPlanningContext,type OutingPlan,type PlanEvent} from '@packages/app-core/outings/model';
import {shiftCalendarDay} from '@packages/app-core/events/discoveryFilters';
import type {EventFilters} from '@packages/app-core/events/types';
import {useMotionValue} from 'framer-motion';
import {eventCities} from '@packages/app-core/events/constants';
import {ActionButton,IconButton} from '@/components/ui/ActionButton';
import {Field,Input} from '@/components/ui/Field';
import {ModalFrame,ModalHeader} from '@/components/ui/ModalFrame';
import {ThemedSelect} from '@/features/events/form/ThemedSelect';
import {DiscoveryDateRibbon} from '@/features/events/filters/DiscoveryDateRibbon';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import {useGroups} from './useGroups';
import s from './groups.module.css';
type Model=ReturnType<typeof useGroups>;
function NightRibbon({value,onChange,label,index,city}:{value:string;onChange:(day:string)=>void;label:string;index:number;city:string}){
 const {i18n}=useTranslation(),[expanded,setExpanded]=useState(true),progress=useMotionValue(1),source=useRef<HTMLSpanElement>(null),minimum=planningToday();
 const filters=useMemo<EventFilters>(()=>({categories:[],vibes:[],date:'Custom',dateFrom:value,dateTo:value,distance:0,city}),[value,city]);
 const selectedLabel=new Intl.DateTimeFormat(i18n.language.startsWith('ro')?'ro-RO':'en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
 return <div className={s.stack} style={{gap:8}} data-testid={'group-night-selector-'+index}><div className={s.sectionHead}><span className="ui-field-label">{label}</span><span className={s.muted}>{selectedLabel}</span></div><div style={{position:'relative',height:54}}><span ref={source} style={{display:'block',width:44,height:44,visibility:'hidden'}} aria-hidden/><DiscoveryDateRibbon filters={filters} onChange={next=>onChange(next.dateFrom||minimum)} minimumDay={minimum} maximumDay={shiftCalendarDay(minimum,365)} progress={progress} sourceRef={source} expanded={expanded} onOpenChange={setExpanded}/></div></div>;
}
export function GroupSettings({group,model,onClose}:{group:FriendGroup;model:Model;onClose:()=>void}){
 const {t}=useTranslation(),router=useRouter(),[name,setName]=useState(group.name),[invite,setInvite]=useState(false),owner=group.ownerId===model.user?.properties.id;
 useEffect(()=>{if(invite)void model.store.catalog()},[invite,model.store]);
 const eligible=model.friends.filter(f=>!group.members.some(m=>m.userId===f.id));
 return <ModalFrame open onClose={onClose} label={t('groups.settings')}><ModalHeader title={t('groups.settings')} onClose={onClose}/><div className={s.modalBody}>
 {model.error&&<p className={s.error} role="alert">{t(model.error)}</p>}
 {owner&&<><Field label={t('groups.name')}><Input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></Field><ActionButton tone="secondary" busy={model.busy} disabled={!name.trim()||name.trim()===group.name} onClick={()=>void model.store.action(group.id,{action:'rename',name})}>{t('groups.rename')}</ActionButton></>}
 <div className={s.stack}>{group.members.map(member=><div key={member.userId} className={s.member}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId}/><span className={s.compact}><strong>{member.username}</strong>{member.status==='pending'&&<small className={s.muted}>{t('groups.pending')}</small>}</span>{owner&&member.userId!==group.ownerId&&<div className={s.actions}>{member.status==='accepted'&&<ActionButton size="compact" tone="ghost" busy={model.busy} onClick={()=>void model.store.action(group.id,{action:'transfer-admin',userId:member.userId})}>{t('groups.transfer')}</ActionButton>}<ActionButton size="compact" tone="danger" busy={model.busy} onClick={()=>void model.store.action(group.id,{action:'remove',userId:member.userId})}>{t('groups.remove')}</ActionButton></div>}</div>)}</div>
 {owner&&group.members.length<GROUP_MEMBER_LIMIT&&<ActionButton tone="secondary" onClick={()=>setInvite(!invite)}>{t('groups.invite')}</ActionButton>}
 {invite&&<div className={s.stack}>{eligible.map(f=><div key={f.id} className={s.member}><MemberAvatar name={f.username} userId={f.id} uri={f.avatarUrl}/><span>{f.username}</span><IconButton label={t('groups.invite')+': '+f.username} busy={model.busy} onClick={()=>void model.store.action(group.id,{action:'invite',userId:f.id})}><Plus size={18}/></IconButton></div>)}</div>}
 <ActionButton tone="secondary" busy={model.busy} onClick={()=>void model.store.action(group.id,{action:'mute',muted:!group.muted})}>{t(group.muted?'groups.unmute':'groups.mute')}</ActionButton>
 <p className={s.muted}>{t('groups.privacy')}</p><ActionButton tone="danger" busy={model.busy} onClick={()=>void model.store.action(group.id,{action:'leave'}).then(ok=>{if(ok){onClose();router.replace('/friends')}})}>{t('groups.leave')}</ActionButton>
 </div></ModalFrame>;
}
export function ProposeNight({group,model,onClose}:{group:FriendGroup;model:Model;onClose:()=>void}){
 const {t}=useTranslation(),router=useRouter(),[dates,setDates]=useState([planningToday()]),[poll,setPoll]=useState(false),[city,setCity]=useState(group.outings.find(p=>p.city)?.city??'');
 const valid=!!city&&dates.every(d=>validPlanningDate(d))&&new Set(dates).size===dates.length;
 return <ModalFrame open onClose={onClose} label={t('groups.propose')}><ModalHeader title={t('groups.propose')} onClose={onClose}/><div className={s.modalBody}>
 {model.error&&<p role="alert" className={s.error}>{t(model.error)}</p>}
 <Field label={t('groups.city')}><ThemedSelect value={city} onChange={setCity} options={eventCities.map(value=>({value,label:value}))} placeholder={t('groups.city')}/></Field>
 {dates.map((day,i)=><NightRibbon key={i} value={day} city={city} label={t('groups.day')+(poll?' '+(i+1):'')} index={i} onChange={day=>setDates(rows=>rows.map((value,n)=>n===i?day:value))}/>)}
 <label className={s.member}><input type="checkbox" checked={poll} onChange={e=>{setPoll(e.target.checked);if(!e.target.checked)setDates(rows=>rows.slice(0,1))}}/><span>{t('groups.chooseTogether')}</span></label>
 {poll&&dates.length<3&&<ActionButton tone="secondary" onClick={()=>setDates(rows=>[...rows,shiftCalendarDay(rows.at(-1)!,1)])}>{t('groups.moreDays')}</ActionButton>}
 <ActionButton data-testid="group-night-submit" busy={model.busy} disabled={!valid} onClick={()=>void model.store.createOuting(group.id,{city,...(poll&&dates.length>1?{dates}:{date:dates[0]})}).then(p=>{if(p){onClose();router.push('/groups/'+group.id+'/outings/'+p.id)}})}>{t('groups.propose')}</ActionButton>
 </div></ModalFrame>;
}
export function EventPicker({group,model,plan,onClose}:{group:FriendGroup;model:Model;plan?:OutingPlan;onClose:()=>void}){
 const {t}=useTranslation(),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{const timer=setTimeout(()=>{setPage(1);void model.store.catalog(search,plan?{date:plan.outingDate,city:plan.city}:undefined)},180);return()=>clearTimeout(timer)},[search,plan?.id,plan?.outingDate,plan?.city,model.store]);
 const events=useMemo(()=>model.events.filter(e=>!plan||matchesPlanningContext(e,plan)),[model.events,plan]);
 const add=async(event:PlanEvent)=>{const result=plan?await model.store.planAction(group.id,plan.id,'proposals',{eventId:event.id}):await model.store.send(group.id,event.id);if(result)onClose()};
 return <ModalFrame open onClose={onClose} label={t(plan?'groups.find':'groups.share')}><ModalHeader title={t(plan?'groups.find':'groups.share')} description={plan?[plan.outingDate,plan.city].filter(Boolean).join(' · '):undefined} onClose={onClose}/><div className={s.modalBody}>
 <Input data-testid="group-event-search" type="search" aria-label={t('groups.search')} placeholder={t('groups.search')} value={search} onChange={e=>setSearch(e.target.value)}/>
 {model.error&&<p role="alert" className={s.error}>{t(model.error)}</p>}
 <div className={s.eventList}>{events.map(event=>{const added=plan?.options.some(o=>o.eventId===event.id);return <div className={s.eventRow} key={event.id}>{event.bannerUrl&&<img onError={e=>{e.currentTarget.style.display='none'}} src={event.bannerUrl} alt=""/>}<div className={`${s.compact} ${s.grow}`}><strong>{event.title}</strong><span className={s.muted}>{event.locationName}</span></div><IconButton data-testid={(plan?'group-propose-event-':'group-send-event-')+event.id} label={t(added?'groups.added':plan?'groups.addProposal':'groups.share')+': '+event.title} disabled={added||!!plan&&plan.options.length>=8} busy={model.busy} onClick={()=>void add(event)}>{added?<Check size={18}/>:<Plus size={18}/>}</IconButton></div>})}</div>
 {model.catalogLoading&&<p role="status" className={s.muted}>{t('common.loading')}</p>}
 {model.catalogMore&&<ActionButton tone="ghost" busy={model.catalogLoading} onClick={()=>{setPage(page+1);void model.store.catalog(search,plan?{date:plan.outingDate,city:plan.city}:undefined,page+1)}}>{t('outings.more')}</ActionButton>}
 </div></ModalFrame>;
}
