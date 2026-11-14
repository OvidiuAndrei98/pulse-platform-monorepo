"use client";
import {useEffect,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {ArrowLeft,Check,Plus,Send} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {GROUP_MEMBER_LIMIT} from '@packages/app-core/social/groups';
import {isOutingId} from '@packages/app-core/outings/model';
import {ActionButton,ActionLink} from '@/components/ui/ActionButton';
import {Field,Input} from '@/components/ui/Field';
import {StatusNotice} from '@/components/ui/StatusNotice';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import {useGroups} from './useGroups';
import {GroupRow} from './GroupRows';
import s from './groups.module.css';

export default function GroupsPage(){
 const model=useGroups(),{t}=useTranslation(),params=useSearchParams(),router=useRouter();
 const [creating,setCreating]=useState(params.get('new')==='1'),[name,setName]=useState(''),[ids,setIds]=useState<string[]>([]),[shared,setShared]=useState('');
 const source=params.get('event'),eventId=isOutingId(source)?source:undefined;
 useEffect(()=>{if(creating)void model.store.catalog()},[creating,model.store]);
 const defaultName=ids.map(id=>model.friends.find(f=>f.id===id)?.username).filter(Boolean).slice(0,3).join(', ');
 const create=async()=>{const g=await model.store.create(name.trim()||defaultName,ids,eventId);if(g)router.push('/groups/'+g.id)};
 return <main className={s.page} data-testid="groups-screen"><header className={s.header}><ActionLink tone="secondary" className={s.circle} href="/friends" aria-label={t('common.back')}><ArrowLeft size={20}/></ActionLink><h1>{t(creating?'groups.create':eventId?'groups.sendTo':'groups.title')}</h1>{!creating&&<ActionButton data-testid="groups-new" className={s.circle} aria-label={t('groups.create')} onClick={()=>setCreating(true)}><Plus size={20}/></ActionButton>}</header>
 {!model.ready?<StatusNotice kind="loading" title={t('common.loading')}/>:!model.user?<StatusNotice title={t('groups.sessionEnded')}><ActionLink href={'/login?returnTo='+encodeURIComponent('/groups'+(eventId?'?event='+eventId:''))}>{t('social.signIn')}</ActionLink></StatusNotice>:<>
 {model.error&&<StatusNotice kind="error" title={t(model.error)} action={()=>void model.store.load()} actionLabel={t('common.retry')}/>}
 {creating?<div className={s.stack}><Field label={t('groups.name')}><Input data-testid="group-name" maxLength={80} value={name} placeholder={defaultName||t('groups.name')} onChange={e=>setName(e.target.value)}/></Field><div className={s.sectionHead}><h2>{t('groups.friends')}</h2><span className={s.muted}>{ids.length+1}/{GROUP_MEMBER_LIMIT}</span></div>
 {model.friends.map(friend=><label className={s.member} key={friend.id}><MemberAvatar name={friend.username} userId={friend.id} uri={friend.avatarUrl}/><span>{friend.username}</span><input type="checkbox" data-testid={'group-friend-'+friend.id} checked={ids.includes(friend.id)} disabled={!ids.includes(friend.id)&&ids.length>=GROUP_MEMBER_LIMIT-1} onChange={()=>setIds(rows=>rows.includes(friend.id)?rows.filter(id=>id!==friend.id):[...rows,friend.id])}/></label>)}
 {model.catalogLoading&&!model.friends.length?<StatusNotice kind="loading" title={t('common.loading')}/>:!model.friends.length&&<p className={s.muted}>{t('groups.noFriends')}</p>}<p className={s.muted}>{t('groups.privacy')}</p><ActionButton data-testid="group-create" busy={model.busy} disabled={!ids.length||!(name.trim()||defaultName)} onClick={()=>void create()}>{t(eventId?'groups.quick':'groups.create')}</ActionButton><ActionButton tone="ghost" onClick={()=>setCreating(false)}>{t('common.back')}</ActionButton></div>:
 model.loading?<StatusNotice kind="loading" title={t('common.loading')}/>:<div className={s.stack}>{model.groups.map(group=>eventId&&group.status==='accepted'?<div className={s.row} key={group.id}><div className={s.grow}><GroupRow group={group}/></div><ActionButton tone={shared===group.id?'secondary':'primary'} disabled={shared===group.id} busy={model.busy} data-testid={'group-share-'+group.id} aria-label={t('groups.share')+': '+group.name} onClick={()=>void model.store.send(group.id,eventId).then(ok=>{if(ok)setShared(group.id)})}>{shared===group.id?<Check size={18}/>:<Send size={18}/>}</ActionButton></div>:<GroupRow key={group.id} group={group}/>)}{shared&&<p role="status" className={s.state}>{t('groups.sent')}</p>}{!model.groups.length&&<div className={s.empty}><h2>{t('groups.newGroup')}</h2><p className={s.muted}>{t('groups.empty')}</p><ActionButton onClick={()=>setCreating(true)}>{t('groups.create')}</ActionButton></div>}</div>}
 </>}
 </main>;
}
