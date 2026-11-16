"use client";
import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowLeft,ArrowUp,BellOff,CalendarDays,ChevronRight,Image as ImageIcon,Loader2,MoreHorizontal,Plus,UsersRound} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {type FriendGroup,type GroupMessage,type SharedEvent} from '@packages/app-core/social/groups';
import {type OutingPlan} from '@packages/app-core/outings/model';
import {outingDate} from '@packages/app-core/outings/presentation';
import {conversationTitle,outingTitle,outingContextLabel,isCanonicalGroupReference,groupConversationRows,groupUpdateSummary,pinnedOutingPresentation,type GroupConversationRow} from '@packages/app-core/social/groupPresentation';
import {ActionButton,ActionLink} from '@/components/ui/ActionButton';
import {TextArea} from '@/components/ui/Field';
import {StatusNotice} from '@/components/ui/StatusNotice';
import {useDrawerViewport} from '@/components/ui/useDrawerViewport';
import {MemberAvatar} from '@/features/outings/OutingPrimitives';
import {formatGroupEventDateTime as formatEventDateTime} from './dateFormat';
import {useGroups} from './useGroups';
import {GroupEventReference} from './GroupEventReference';
import {GroupUpdate} from './GroupAudit';
import {ActionMenu} from './ActionMenu';
import {GroupAvatars,GroupMemberCaption} from './GroupRows';
import s from './groups.module.css';
type ScrollPosition={top:number;bottom:boolean;anchor?:{id:string;offset:number};sizes:Map<string,number>};
const scrollMemory=new Map<string,ScrollPosition>();
type Model=ReturnType<typeof useGroups>;
export function OutingSummary({plan,groupId,onChoose,actor,collection=false,collectionFrom='info',presentation}:{plan:OutingPlan;groupId:string;onChoose?:()=>void;actor?:string;collection?:boolean;collectionFrom?:'chat'|'info';presentation?:{title:string;subtitle:string;eligibleCount?:number}}){
 const {t,i18n}=useTranslation(),event=plan.options.find(e=>e.eventId===plan.chosenEventId),heading=presentation?.title??event?.title??(plan.outingDate?outingTitle(plan,i18n.language):t('groups.poll')),context=presentation?.subtitle??outingContextLabel({...plan,title:event?.title??plan.title},i18n.language);
 const content=<>{(collection||presentation)&&event?.imageUrl?<img onError={e=>{e.currentTarget.style.visibility='hidden'}} src={event.imageUrl} alt=""/>:presentation?<CalendarDays className={s.summaryIcon} size={22} aria-hidden/>:<span className={s.summaryDate}><strong>{outingDate(plan.outingDate,i18n.language,'day')||'—'}</strong><span>{outingDate(plan.outingDate,i18n.language,'month')}</span></span>}<span className={`${s.compact} ${s.grow}`}><strong>{heading}</strong><span className={s.muted}>{context||t('groups.suggestionsCount',{count:plan.options.length})}{collection&&['completed','cancelled'].includes(plan.lifecycle??'')?' · '+t('groups.'+plan.lifecycle):''}</span></span>{presentation&&(presentation.eligibleCount??0)>1&&<span className={s.summaryCount} aria-label={t('groups.moreOutings',{count:presentation.eligibleCount!-1})}>+{presentation.eligibleCount!-1}</span>}<ChevronRight size={17}/></>;
 return onChoose?<button data-testid="group-summary" className={s.summary} onClick={onChoose}>{content}</button>:<Link data-testid={collection?'group-outing-row-'+plan.id:'group-summary'} className={collection?s.summaryRow:s.summary} style={{textDecoration:'none'}} href={'/groups/'+groupId+'/outings/'+plan.id+(collection?'?from=outings&origin='+collectionFrom:'')}>{content}</Link>;
}
export function SharedEventCard(props:{event:SharedEvent;message?:GroupMessage;group:FriendGroup;model:Model;compact?:boolean}){return <GroupEventReference {...props}/>}
const Message=memo(function Message({message,group,model,previous}:{message:GroupMessage;group:FriendGroup;model:Model;previous?:GroupMessage}){
 const {t,i18n}=useTranslation(),own=message.senderId===model.user?.properties.id,same=previous?.senderId===message.senderId&&Date.parse(message.createdAt)-Date.parse(previous.createdAt)<5*60_000;
 return <div className={s.message} data-own={own} data-kind={message.kind} data-message-id={message.id}>{!own&&<span className={s.messageAvatar}>{!same&&<MemberAvatar name={message.username} uri={message.avatarUrl} userId={message.senderId}/>}</span>}<div className={s.messageBody}>{!own&&!same&&<p className={s.sender}>{message.username}</p>}{message.content&&<p data-message-text className={s.bubble}>{message.content}</p>}{(message.kind==='event'||isCanonicalGroupReference(message))&&(message.event?<SharedEventCard event={message.event} message={message} group={group} model={model}/>:<p className={s.bubble}>{t('groups.eventUnavailable')}</p>)}<time data-testid="group-message-time" dateTime={message.createdAt} className={s.time}>{new Intl.DateTimeFormat(i18n.language,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(message.createdAt))}</time></div></div>;
});

function HistoricalUpdates({row,group,model}:{row:Extract<GroupConversationRow,{kind:'updates'}>;group:FriendGroup;model:Model}){
 const bySeq=new Map((model.messages[group.id]??[]).map(message=>[message.seq,message]));return <div className={s.historyUpdates} data-testid="group-history-updates" data-message-id={row.id}>{[...row.messages].sort((a,b)=>a.seq-b.seq).map(message=><GroupUpdate key={message.id} message={message} previous={bySeq.get(message.seq-1)} groupId={group.id} inline/>)}</div>;
}
function MeasuredMessage({id,onHeight,children}:{id:string;onHeight:(id:string,height:number)=>void;children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);useLayoutEffect(()=>{const node=ref.current;if(!node)return;const measure=()=>{const height=node.getBoundingClientRect().height;if(height>0&&node.getClientRects().length)onHeight(id,height)};measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect()},[id,onHeight]);return <div ref={ref} data-chat-row={id}>{children}</div>;
}
export default function GroupConversation({groupId}:{groupId:string}){
 const model=useGroups(groupId),{t,i18n}=useTranslation(),router=useRouter(),group=model.groups.find(g=>g.id===groupId),actor=model.user?.properties.id;
 const chatViewport=useDrawerViewport(!!model.user&&group?.status==='accepted'&&!model.revoked.includes(groupId),'panel',true,true);
 const [newMessages,setNewMessages]=useState(false);
 const pinKey=actor+':'+groupId+':'+(group?.joinedAt??'');
 const viewport=useRef<HTMLDivElement>(null),nearBottom=useRef(true),lastRead=useRef(0),lastSeq=useRef(0),initial=useRef(false),sizeCache=useRef(new Map<string,number>()),[measureRevision,setMeasureRevision]=useState(0),[range,setRange]=useState({top:0,height:800});
 const prependAnchor=useRef<{id:string;offset:number}|null>(null),[loadingOlder,setLoadingOlder]=useState(false);
 const composer=useRef<HTMLTextAreaElement>(null),sendingRef=useRef(false),sendScope=useRef(0),[sending,setSending]=useState(false),draft=model.drafts[groupId]??'';
 useLayoutEffect(()=>{const saved=scrollMemory.get(pinKey);initial.current=false;lastRead.current=0;lastSeq.current=0;nearBottom.current=saved?.bottom??true;sizeCache.current=new Map(saved?.sizes);prependAnchor.current=saved&&!saved.bottom?saved.anchor??null:null;setRange(value=>({...value,top:saved?.top??0}));setMeasureRevision(value=>value+1)},[pinKey]);
 const messages=useMemo(()=>[...(model.messages[groupId]??[])].reverse(),[model.messages,groupId]);
 const rows=useMemo(()=>{
  const bySeq=new Map(messages.map(message=>[message.seq,message]));
  return groupConversationRows(messages,group?.outings??[]).flatMap<GroupConversationRow>(row=>{
   const updates=row.kind==='updates'?row.messages:row.message.kind==='outing'&&!isCanonicalGroupReference(row.message)?[row.message]:undefined;
   if(!updates)return[row];
   const visible=updates.filter(message=>{const label=groupUpdateSummary(message,bySeq.get(message.seq-1),i18n.language,t);return label!==t('groups.updateAnonymous')&&label!==t('groups.updateGeneric',{name:message.username.trim()})});
   if(!visible.length)return[];
   return[{kind:'updates',id:row.id,outingId:visible[0].outingId!,messages:visible,count:visible.length,firstAt:visible[0].createdAt,lastAt:visible[visible.length-1].createdAt}];
  });
 },[messages,group?.outings,i18n.language,t]);
 useLayoutEffect(()=>{sendScope.current++;sendingRef.current=false;setSending(false)},[pinKey]);
 useLayoutEffect(()=>{const node=composer.current;if(!node)return;node.style.height='44px';node.style.height=Math.min(Math.max(132,Math.min(220,Math.round(window.innerHeight*.27))),node.scrollHeight)+'px'},[draft]);
 const submitMessage=async()=>{if(sendingRef.current||model.busy||!draft.trim())return;const scope=++sendScope.current;nearBottom.current=true;setNewMessages(false);sendingRef.current=true;setSending(true);try{await model.store.send(groupId)}finally{if(scope===sendScope.current){sendingRef.current=false;setSending(false)}}};
 const loadedSeq=messages.at(-1)?.seq??0;
 const summary=pinnedOutingPresentation(group?.outings??[],i18n.language,t);
 const heights=useMemo(()=>{const offsets=[0];for(const row of rows)offsets.push(offsets.at(-1)!+(sizeCache.current.get(row.id)??(row.kind==='updates'?52:row.message.kind==='text'?90:285)));return offsets},[rows,measureRevision]);
 const measure=useMemo(()=>(id:string,height:number)=>{if(height<=0||Math.abs((sizeCache.current.get(id)??0)-height)<1)return;sizeCache.current.set(id,height);setMeasureRevision(n=>n+1)},[]);
 let first=0;while(first<rows.length&&heights[first+1]<range.top-700)first++;let end=first;while(end<rows.length&&heights[end]<range.top+range.height+700)end++;
 const remember=()=>{const node=viewport.current;if(!node||node.clientHeight<=0)return;const top=node.getBoundingClientRect().top,row=[...node.querySelectorAll<HTMLElement>('[data-chat-row]')].find(row=>row.getBoundingClientRect().bottom>top),anchor=row?{id:row.dataset.chatRow!,offset:row.getBoundingClientRect().top-top}:undefined;scrollMemory.set(pinKey,{top:node.scrollTop,bottom:nearBottom.current,anchor,sizes:new Map(sizeCache.current)});if(scrollMemory.size>30)scrollMemory.delete(scrollMemory.keys().next().value!)};
 const navigate=(href:string)=>{remember();router.push(href,{scroll:false})};
 useLayoutEffect(()=>{const node=viewport.current;if(!node)return;const update=()=>{if(node.clientHeight<=0||!node.getClientRects().length)return;if(nearBottom.current&&initial.current&&!prependAnchor.current)node.scrollTop=node.scrollHeight;setRange({top:node.scrollTop,height:node.clientHeight})};const observer=new ResizeObserver(update);observer.observe(node);update();return()=>observer.disconnect()},[group?.status]);
 useLayoutEffect(()=>{const node=viewport.current;if(!node||node.clientHeight<=0||!rows.length)return;if(!initial.current){const saved=scrollMemory.get(pinKey);initial.current=true;node.scrollTop=saved?.bottom===false?saved.top:node.scrollHeight;nearBottom.current=saved?.bottom??true;prependAnchor.current=saved&&!saved.bottom?saved.anchor??null:null;setRange({top:node.scrollTop,height:node.clientHeight})}else if(nearBottom.current&&!prependAnchor.current){node.scrollTop=node.scrollHeight;setRange({top:node.scrollTop,height:node.clientHeight})}else if(loadedSeq>lastSeq.current)setNewMessages(true);lastSeq.current=loadedSeq},[rows,actor,groupId,heights]);
 // A virtual window can replace DOM children during a prepend. Keep an explicit
 // visible message anchor through that first estimate and subsequent measurements.
 useLayoutEffect(()=>{const node=viewport.current,anchor=prependAnchor.current;if(!node||node.clientHeight<=0||!anchor)return;const index=rows.findIndex(row=>row.id===anchor.id);if(index<0)return;const row=node.querySelector<HTMLElement>('[data-chat-row="'+anchor.id+'"]'),top=node.getBoundingClientRect().top,spacer=node.querySelector<HTMLElement>('[data-message-spacer]');if(!spacer)return;const delta=row?row.getBoundingClientRect().top-top-anchor.offset:spacer.getBoundingClientRect().top-top+heights[index]-anchor.offset;if(Math.abs(delta)>.5){node.scrollTop+=delta;setRange({top:node.scrollTop,height:node.clientHeight})}},[rows,heights,range.top]);
 const loadOlder=async()=>{const node=viewport.current;if(!node||loadingOlder)return;remember();prependAnchor.current=scrollMemory.get(pinKey)?.anchor??null;setLoadingOlder(true);try{await model.store.loadMessages(groupId,true)}finally{setLoadingOlder(false)}};
 useEffect(()=>{if(group?.status==='accepted'&&nearBottom.current&&loadedSeq>lastRead.current){lastRead.current=loadedSeq;void model.store.read(groupId,loadedSeq)}},[loadedSeq,group?.status,model.store,groupId]);



 if(!model.ready||model.loading&&!group)return <main className={s.page}><StatusNotice kind="loading" title={t('common.loading')}/></main>;
 if(!model.user)return <main className={s.page}><ActionLink href={'/login?returnTo='+encodeURIComponent('/groups/'+groupId)}>{t('groups.sessionEnded')}</ActionLink></main>;
 if(!group||model.revoked.includes(groupId))return <main className={s.page}><StatusNotice kind="error" title={t(model.error??'groups.accessLost')}/><ActionLink href="/friends">{t('common.back')}</ActionLink></main>;
 if(group.status==='pending')return <main className={s.page}><ActionLink className={s.circle} href="/friends" tone="secondary" aria-label={t('common.back')}><ArrowLeft size={20}/></ActionLink><div className={s.empty}>{model.error&&<p role="alert" className={s.error}>{t(model.error)}</p>}<GroupAvatars group={group}/><h1>{conversationTitle(group,actor,true)}</h1><p className={s.state}>{t('groups.invited')}</p><p className={s.muted}>{group.members.map(m=>m.username).join(' · ')}</p><p className={s.muted}>{t('groups.privacy')}</p><ActionButton data-testid="group-accept" busy={model.busy} onClick={()=>void model.store.action(groupId,{action:'accept'})}>{t('groups.accept')}</ActionButton><ActionButton tone="ghost" busy={model.busy} onClick={()=>void model.store.action(groupId,{action:'decline'}).then(ok=>{if(ok)router.replace('/friends')})}>{t('groups.decline')}</ActionButton></div></main>;
 return <main ref={chatViewport} className={s.chat} data-group-conversation data-testid="friend-group"><header className={s.chatHeader}><ActionLink tone="secondary" className={s.circle} aria-label={t('common.back')} href="/friends"><ArrowLeft size={20}/></ActionLink><button data-testid="group-info-open" className={`${s.chatTitle} ${s.grow}`} onClick={()=>navigate('/groups/'+groupId+'/info')}><GroupAvatars group={group}/><span className={s.chatTitleCopy}><span>{conversationTitle(group,actor)}</span><span className={s.muted} style={{display:'block',fontWeight:400}}><GroupMemberCaption group={group}/></span></span></button><ActionMenu testId="group-menu" className={s.circle} label={t('groups.info')} icon={<MoreHorizontal size={21}/>} items={[{key:'members',label:t('groups.info'),icon:<UsersRound size={18}/>,onSelect:()=>navigate('/groups/'+groupId+'/info')},{key:'mute',label:t(group.muted?'groups.unmute':'groups.mute'),icon:<BellOff size={18}/>,onSelect:()=>void model.store.action(groupId,{action:'mute',muted:!group.muted})}]}/></header>
 {summary&&<OutingSummary plan={summary.plan} presentation={summary} groupId={groupId} actor={actor} onChoose={()=>navigate(summary.eligibleCount>1?'/groups/'+groupId+'/outings?from=chat':'/groups/'+groupId+'/outings/'+summary.plan.id)}/>}
 {model.error&&!model.sendError&&<div className={s.messageNotice}><p className={s.error} role="alert">{t(model.error)}</p></div>}
 <div data-testid="group-messages" ref={viewport} className={s.messages} role="log" aria-label={conversationTitle(group,actor,true)} aria-live="off" onPointerDown={()=>{prependAnchor.current=null}} onTouchStart={()=>{prependAnchor.current=null}} onWheel={()=>{prependAnchor.current=null}} onKeyDown={()=>{prependAnchor.current=null}} onScroll={e=>{const node=e.currentTarget;if(node.clientHeight<=0)return;nearBottom.current=node.scrollHeight-node.clientHeight-node.scrollTop<80;setRange({top:node.scrollTop,height:node.clientHeight});remember();if(nearBottom.current){setNewMessages(false);if(loadedSeq>lastRead.current){lastRead.current=loadedSeq;void model.store.read(groupId,loadedSeq)}}}}>
 {model.more[groupId]&&<ActionButton data-testid="group-older" tone="ghost" busy={loadingOlder} onClick={()=>void loadOlder()}>{t('groups.older')}</ActionButton>}
 <div className={s.messagesContent}>
 {!messages.length&&<p className={s.chatEmpty}>{t('groups.chatEmpty')}</p>}
 <div data-message-spacer style={{height:heights[first],flexShrink:0}} aria-hidden/>{rows.slice(first,end).map((row,index)=>{const previous=rows[first+index-1];return <MeasuredMessage key={row.id} id={row.id} onHeight={measure}>{row.kind==='updates'?<HistoricalUpdates row={row} group={group} model={model}/>:<Message message={row.message} previous={previous?.kind==='message'?previous.message:undefined} group={group} model={model}/>}</MeasuredMessage>})}<div style={{height:heights.at(-1)!-heights[end],flexShrink:0}} aria-hidden/>
 </div>
 </div>
 {newMessages&&<div className={s.messageNotice}><ActionButton tone="secondary" size="compact" onClick={()=>{const node=viewport.current;if(node){node.scrollTop=node.scrollHeight;setRange({top:node.scrollTop,height:node.clientHeight})}nearBottom.current=true;setNewMessages(false)}}>{t('groups.newMessages')}</ActionButton></div>}
 {model.sendError&&<p role="alert" className={`${s.error} ${s.messageNotice}`}>{t(model.sendError)}</p>}
 <form className={s.composer} onSubmit={event=>{event.preventDefault();void submitMessage()}}><ActionMenu testId="group-add" className={s.circle} label={t('groups.plus')} icon={<Plus size={20}/>} items={[{key:'events',testId:'group-open-events',label:t('groups.share'),icon:<ImageIcon size={18}/>,onSelect:()=>navigate('/groups/'+groupId+'/events/select?from=chat')},{key:'night',testId:'group-propose-night',label:t('groups.propose'),icon:<CalendarDays size={18}/>,onSelect:()=>navigate('/groups/'+groupId+'/outings/new?from=chat')}]}/><div data-testid="group-composer-field" className={s.composerField}><TextArea ref={composer} data-testid="group-composer" aria-label={t('groups.message')} placeholder={t('groups.message')} maxLength={2000} value={draft} onChange={event=>model.store.draft(groupId,event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void submitMessage()}}}/>{!!draft.trim()&&<ActionButton type="submit" data-testid="group-send" className={s.composerSend} disabled={sending||model.busy} aria-busy={sending||undefined} aria-label={t('groups.send')}>{sending?<Loader2 data-testid="group-send-spinner" aria-hidden className="ui-spinner"/>:<ArrowUp data-testid="group-send-arrow" aria-hidden size={18}/>}</ActionButton>}</div></form>

 </main>;
}
