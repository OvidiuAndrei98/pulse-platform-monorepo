"use client";
import Link from 'next/link';
import {Plus} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {FriendGroup} from '@packages/app-core/social/groups';
import {groupMembershipCounts} from '@packages/app-core/social/groups';
import {conversationTitle,conversationPreview} from '@packages/app-core/social/groupPresentation';
import {useDataProvider} from '@/core/DataProviderContext';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import {ActionLink} from '@/components/ui/ActionButton';
import {StatusNotice} from '@/components/ui/StatusNotice';
import {useGroups} from './useGroups';
import s from './groups.module.css';

export function GroupAvatars({group}:{group:FriendGroup}){return <span className={s.avatarStack} aria-hidden>{group.members.slice(0,2).map(m=><MemberAvatar key={m.userId} name={m.username} uri={m.avatarUrl} userId={m.userId}/>)}</span>}
export function GroupMemberCaption({group}:{group:FriendGroup}){const {t}=useTranslation(),counts=groupMembershipCounts(group);return <>{t('groups.members',{count:counts.accepted})}{counts.pending>0?' · '+t('groups.invitedCount',{count:counts.pending}):''}</>}
export function GroupRow({group,href}:{group:FriendGroup;href?:string}){
 const {t,i18n}=useTranslation(),{user}=useDataProvider(),time=Date.parse(group.activityAt??''),today=new Date().toDateString();
 const stamp=Number.isFinite(time)?new Intl.DateTimeFormat(i18n.language,new Date(time).toDateString()===today?{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}:{day:'numeric',month:'short'}).format(time):'';
 return <Link className={s.groupRow} href={href??'/groups/'+group.id} data-testid={'group-row-'+group.id}><GroupAvatars group={group}/><span className={s.grow}><span className={s.conversationTop}><strong className={s.ellipsis}>{conversationTitle(group,user?.properties.id)}</strong><time dateTime={group.activityAt}>{stamp}</time></span><span className={`${s.muted} ${s.ellipsis}`} style={{display:'block'}}>{conversationPreview(group,i18n.language,(key,values)=>String(t(key,values)))}</span></span>{group.unread>0&&<span className={s.badge}>{Math.min(99,group.unread)}</span>}</Link>;
}
export function GroupsSection(){
 const model=useGroups(),{t}=useTranslation();
 return <section className={`${s.stack} ${s.conversations}`} aria-labelledby="friend-groups-title"><div className={s.sectionHead}><h2 id="friend-groups-title">{t('groups.title')}</h2><div className={s.actions}><ActionLink data-testid="groups-see-all" tone="ghost" href="/groups">{t('common.seeAll')}</ActionLink><ActionLink data-testid="groups-new" tone="secondary" className={s.circle} href="/groups?new=1" aria-label={t('groups.create')}><Plus size={19}/></ActionLink></div></div>
  {model.loading?<StatusNotice kind="loading" title={t('common.loading')}/>:model.error?<StatusNotice kind="error" title={t(model.error)} action={()=>void model.store.load()} actionLabel={t('common.retry')}/>:model.groups.length?<div>{model.groups.slice(0,4).map(g=><GroupRow key={g.id} group={g}/>)}</div>:<div className={s.empty}><h2>{t('groups.newGroup')}</h2><p className={s.muted}>{t('groups.empty')}</p><ActionLink href="/groups?new=1">{t('groups.create')}</ActionLink></div>}
 </section>;
}
