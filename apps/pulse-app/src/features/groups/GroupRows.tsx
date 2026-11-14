"use client";
import Link from 'next/link';
import {ChevronRight,Plus} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {FriendGroup} from '@packages/app-core/social/groups';
import {preferredGroupOuting} from '@packages/app-core/social/groups';
import {outingDate} from '@packages/app-core/outings/presentation';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import {ActionLink} from '@/components/ui/ActionButton';
import {StatusNotice} from '@/components/ui/StatusNotice';
import {useGroups} from './useGroups';
import s from './groups.module.css';

export function GroupAvatars({group}:{group:FriendGroup}){return <span className={s.avatarStack} aria-hidden>{group.members.slice(0,2).map(m=><MemberAvatar key={m.userId} name={m.username} uri={m.avatarUrl} userId={m.userId}/>)}</span>}
export function GroupRow({group,href}:{group:FriendGroup;href?:string}){
 const {t,i18n}=useTranslation(),outing=preferredGroupOuting(group.outings),chosen=outing?.options.find(e=>e.eventId===outing.chosenEventId);
 return <Link className={s.groupRow} href={href??'/groups/'+group.id} data-testid={'group-row-'+group.id}><GroupAvatars group={group}/><span className={s.grow}><span className={s.row}><strong className={s.ellipsis}>{group.name}</strong>{group.status==='pending'&&<span className={s.state}>{t('groups.invited')}</span>}</span><span className={`${s.muted} ${s.ellipsis}`} style={{display:'block'}}>{group.status==='pending'?group.members.map(m=>m.username).join(' · '):group.preview||t('groups.members',{count:group.members.filter(m=>m.status==='accepted').length})}</span>{outing&&<span className={s.sharedCaption}>{outingDate(outing.outingDate,i18n.language)}{chosen?' · '+chosen.title:''}</span>}</span>{group.unread>0&&<span className={s.badge}>{Math.min(99,group.unread)}</span>}<ChevronRight size={16}/></Link>;
}
export function GroupsSection(){
 const model=useGroups(),{t}=useTranslation();
 return <section className={s.stack} aria-labelledby="friend-groups-title"><div className={s.sectionHead}><h2 id="friend-groups-title">{t('groups.title')}</h2><ActionLink data-testid="groups-new" className={s.circle} href="/groups?new=1" aria-label={t('groups.create')}><Plus size={19}/></ActionLink></div>
  {model.loading?<StatusNotice kind="loading" title={t('common.loading')}/>:model.error?<StatusNotice kind="error" title={t(model.error)} action={()=>void model.store.load()} actionLabel={t('common.retry')}/>:model.groups.length?<><div>{model.groups.slice(0,4).map(g=><GroupRow key={g.id} group={g}/>)}</div>{model.groups.length>4&&<ActionLink href="/groups" tone="ghost">{t('groups.title')} →</ActionLink>}</>:<div className={s.empty}><h2>{t('groups.newGroup')}</h2><p className={s.muted}>{t('groups.empty')}</p><ActionLink href="/groups?new=1">{t('groups.create')}</ActionLink></div>}
 </section>;
}
