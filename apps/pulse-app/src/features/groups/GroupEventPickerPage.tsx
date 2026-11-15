"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {Check,Plus,Search} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {groupCatalogKey} from '@packages/app-core/social/groups';
import {matchesPlanningContext,type PlanEvent} from '@packages/app-core/outings/model';
import {outingDate} from '@packages/app-core/outings/presentation';
import {ActionButton,ActionLink,IconButton} from '@/components/ui/ActionButton';
import {Input} from '@/components/ui/Field';
import {StatusNotice} from '@/components/ui/StatusNotice';
import {GroupPageFrame,groupPath} from './GroupManagement';
import {ProposeNight} from './GroupDialogs';
import {nightDraft,saveNightDraft} from './nightDraft';
import {EventPreview} from './EventPreview';
import {useGroups} from './useGroups';
import s from './groups.module.css';

export default function GroupEventPickerPage({groupId,planId,from='chat',returnFrom='chat'}:{groupId:string;planId?:string;from?:string;returnFrom?:string}){
 const model=useGroups(groupId),{t,i18n}=useTranslation(),router=useRouter(),group=model.groups.find(g=>g.id===groupId),plan=group?.outings.find(p=>p.id===planId),local=from==='night'?nightDraft(model.store,groupId):undefined;
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[debouncing,setDebouncing]=useState(true),[editing,setEditing]=useState(false),[attempted,setAttempted]=useState(''),[saving,setSaving]=useState(false),active=useRef(true),guard=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 const root=groupPath(groupId),back=from==='night'?root+'/outings/new?from='+encodeURIComponent(returnFrom):planId?root+'/outings/'+planId+(returnFrom==='outings'?'?from=outings':''):from==='events'?root+'/events':root;
 const context=useMemo(()=>plan?{date:plan.outingDate,city:plan.city}:local?{date:local.dates[0],city:local.city}:undefined,[plan?.outingDate,plan?.city,local?.dates[0],local?.city]);
 const key=groupCatalogKey(search,context),current=model.catalogKey===key,loading=debouncing||!current||model.catalogStatus==='loading'&&page===1||model.catalogStatus==='idle',failed=current&&model.catalogStatus==='error';
 const closed=!!plan&&['completed','cancelled'].includes(plan.lifecycle??''),canEdit=!!plan&&!closed&&plan.ownerId===model.user?.properties.id;
 useEffect(()=>{if(group?.status!=='accepted'||!planId||plan)return;let cancelled=false;void model.store.loadPlan(groupId,planId).finally(()=>{if(!cancelled)setAttempted(planId)});return()=>{cancelled=true}},[group?.status,!!plan,planId,groupId,model.store]);
 useEffect(()=>{if(group?.status!=='accepted'||planId&&!plan||from==='night'&&!local)return;setDebouncing(true);const timer=setTimeout(()=>{setPage(1);setDebouncing(false);void model.store.catalog(search,context)},search?180:0);return()=>clearTimeout(timer)},[search,context,model.store,group?.status,!!plan,planId,from,!!local]);
 const events=useMemo(()=>!current?[]:model.events.filter(event=>!context?.date||matchesPlanningContext(event,{outingDate:context.date,city:context.city})),[current,model.events,context]);
 const reload=()=>{setPage(1);void model.store.catalog(search,context)};
 const add=async(event:PlanEvent)=>{if(guard.current||closed)return;guard.current=true;setSaving(true);try{
  if(from==='night'&&local){saveNightDraft(model.store,groupId,{...local,selectedEvent:event});router.replace(back);return}
  const ok=plan?await model.store.planAction(groupId,plan.id,'proposals',{eventId:event.id,revision:plan.revision}):await model.store.send(groupId,event.id);
  if(ok&&active.current)router.replace(back);
 }finally{guard.current=false;if(active.current)setSaving(false)}};
 const title=t(from==='night'?'groups.selectEvent':planId?'groups.proposeEvent':'groups.share'),label=context?[outingDate(context.date,i18n.language)||t('groups.poll'),context.city].filter(Boolean).join(' · '):undefined;
 return <GroupPageFrame model={model} groupId={groupId} title={title} back={back} testId="group-event-picker">{group=><>
 {planId&&!plan?(attempted===planId?<StatusNotice kind="error" title={t(model.error??'groups.outingUnavailable')} action={()=>void model.store.loadPlan(groupId,planId)} actionLabel={t('common.retry')}/>:<StatusNotice kind="loading" title={t('common.loading')}/>):from==='night'&&!local?<ActionLink href={back}>{t('groups.noDateCity')}</ActionLink>:closed?<p className={s.muted}>{t('groups.completed')}</p>:plan&&!plan.outingDate?<div className={s.empty}><p className={s.muted}>{t('groups.noDate')}</p><ActionLink href={back}>{t('groups.chooseNight')}</ActionLink></div>:<>
 <section className={s.pickerHeading}>{label&&<div className={s.sectionHead}><p className={s.muted}>{label}</p>{canEdit&&<ActionButton data-testid="group-picker-edit-context" tone="ghost" size="compact" onClick={()=>setEditing(true)}>{t('groups.change')}</ActionButton>}</div>}<div className={s.pickerSearch}><Search size={18} aria-hidden/><Input data-testid="group-event-search" type="search" aria-label={t('groups.search')} placeholder={t('groups.search')} value={search} onChange={e=>setSearch(e.target.value)}/></div></section>
 {loading?<StatusNotice kind="loading" title={t('common.loading')}/>:failed?<StatusNotice kind="error" title={t(model.catalogError==='groups.actionForbidden'?'groups.actionForbidden':'groups.eventPickerError')} detail={model.catalogError&&model.catalogError!=='groups.failed'&&model.catalogError!=='groups.actionForbidden'?t(model.catalogError):undefined} action={reload} actionLabel={t('common.retry')} busy={model.catalogLoading}/>:events.length?<div className={s.eventList}>{events.map(event=>{const added=!!plan?.options.some(option=>option.eventId===event.id)||from==='night'&&local?.selectedEvent?.id===event.id;return <EventPreview key={event.id} title={event.title} startTime={event.startTime} imageUrl={event.bannerUrl} location={event.locationName} action={<IconButton data-testid={(from==='night'?'group-select-event-':plan?'group-propose-event-':'group-send-event-')+event.id} label={t(added?plan?'groups.alreadyProposed':'groups.selectedEvent':from==='night'?'groups.selectEvent':plan?'groups.addProposal':'groups.share')+': '+event.title} disabled={added||!!plan&&plan.options.length>=8} busy={saving} onClick={()=>void add(event)}>{added?<Check size={18}/>:<Plus size={18}/>}</IconButton>}>{added&&<span className={s.state}>{t(plan?'groups.alreadyProposed':'groups.selectedEvent')}</span>}</EventPreview>})}</div>:<div data-testid="group-event-empty" className={s.empty}><p className={s.muted}>{t(search?'groups.emptySearchResults':context?.date?'groups.eventPickerEmpty':'groups.eventPickerEmptyGeneral',{night:outingDate(context?.date,i18n.language),city:context?.city??''})}</p>{search&&<ActionButton tone="secondary" onClick={()=>setSearch('')}>{t('groups.clearSearch')}</ActionButton>}{canEdit&&<ActionButton data-testid="group-picker-empty-edit" tone="secondary" onClick={()=>setEditing(true)}>{t('groups.editNight')}</ActionButton>}</div>}
 {current&&!loading&&!failed&&model.catalogMore&&<ActionButton tone="ghost" busy={model.catalogLoading} onClick={()=>{setPage(page+1);void model.store.catalog(search,context,page+1)}}>{t('outings.more')}</ActionButton>}
 {model.error&&<p role="alert" className={s.error}>{t(model.error)}</p>}
 {editing&&plan&&canEdit&&<ProposeNight group={group} model={model} plan={plan} onClose={()=>setEditing(false)} onSaved={()=>{setEditing(false);setSearch('')}}/>}
 </>}
 </>}</GroupPageFrame>;
}
