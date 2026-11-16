import React,{useState,useEffect,useRef} from 'react';
import {View} from 'react-native';
import type {BottomSheetScrollViewMethods} from '@gorhom/bottom-sheet';
import {useNavigation} from '@react-navigation/native';
import {useQuery} from '@tanstack/react-query';
import {randomUUID} from 'expo-crypto';
import {Check,ChevronRight} from 'lucide-react-native';
import {eligiblePlanRecipients,recipientHasPendingAccess,outingCheckoutRecovery,type OutingCheckoutRecovery} from '@packages/app-core/outings/experience';
import {groupTicketLabel} from '@packages/app-core/social/groups';
import {getTicketAvailability,getRemainingTicketCapacity} from '@packages/app-core/checkout/ticketAvailability';
import {checkoutTotals} from '@packages/app-core/checkout/totals';
import {formatRon} from '@packages/app-core/events/serviceFee';
import type {OutingPlan,PlanFriend} from '@packages/app-core/outings/model';
import {useEvent,queryClient} from '../data/queries';
import {accountApi,useAuth} from '../auth/AuthProvider';
import {GroupActionSheet} from '../groups/GroupActionSheet';
import {EventImage} from '../ui/common';
import {groupEventDate} from '@packages/app-core/social/groupPresentation';
import {Text} from '../ui/Text';
import {usePreferences} from '../usePreferences';
import {MemberAvatar,OutingPressable,OutingAction} from './OutingPrimitives';
import {o} from './outingsStyles';
import {colors,tokens} from '../ui/theme';
import {openAccountPage} from '../navigation/accountNavigation';

export type RecipientTaskDraft={scope:string;ids:string[];tier:string};
type Props={plan?:OutingPlan;eventId?:string;actor:string;onClose:()=>void;onReviewSelection?:()=>void;onRecoverCheckout?:(orderId:string)=>Promise<void>;friendsOnly?:boolean;draftRef?:React.MutableRefObject<RecipientTaskDraft|null>;pendingInvitations?:number};
export function PlanTicketRecipients({plan,eventId,actor,onClose,onReviewSelection,onRecoverCheckout,friendsOnly=false,draftRef,pendingInvitations}:Props){
 const {copy,language}=usePreferences(),navigation=useNavigation<any>(),auth=useAuth('account');
 const id=plan?.chosenEventId??eventId??'',query=useEvent(id),event=query.data;
 const people=useQuery({queryKey:['gift-friends',actor],enabled:!plan,queryFn:({signal})=>accountApi<PlanFriend[]>('/friends',{signal})});
 const eligible:OutingPlan['members']=plan?eligiblePlanRecipients(plan):[
  {userId:actor,username:auth.user?.username??'',status:'accepted',ticketState:'unknown'},
  ...(people.data??[]).map(friend=>({userId:friend.id,username:friend.username,avatarUrl:friend.avatarUrl,status:'accepted' as const,ticketState:'unknown' as const})),
 ];
 const taskScope=actor+':'+(plan?.id??id)+':'+(plan?.decisionRound??0)+':'+id+':'+friendsOnly;
 const cached=draftRef?.current?.scope===taskScope?draftRef.current:undefined;
 const [ids,setIds]=useState<string[]>(()=>cached?.ids??(!friendsOnly&&plan?.members.some(m=>m.userId===actor&&m.status==='accepted'&&m.ticketState==='none'&&m.hasTicket===false&&!recipientHasPendingAccess(m))?[actor]:[]));
 const [tier,setTier]=useState(cached?.tier??''),[extra,setExtra]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [page,setPage]=useState<'main'|'types'>('main'),scroll=useRef<BottomSheetScrollViewMethods>(null),mainOffset=useRef(0),restoring=useRef(false),restoreFrame=useRef<number|null>(null),purchasePending=useRef(false);
 const freeKey=useRef<{fingerprint:string;key:string}|null>(null),alive=useRef(true);
 const [closing,setClosing]=useState(false),afterDismiss=useRef<null|(()=>void)>(null),dismissed=useRef(false),closeRequested=useRef(false),scopeToken=useRef(auth.controller.getToken());
 const [recovery,setRecovery]=useState<OutingCheckoutRecovery>();
 const currentTask=useRef(taskScope);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;if(restoreFrame.current!==null)cancelAnimationFrame(restoreFrame.current)}},[]);
 useEffect(()=>{if(draftRef)draftRef.current={scope:taskScope,ids:[...ids],tier}},[taskScope,ids.join(','),tier,draftRef]);
 const showPage=(next:'main'|'types')=>{restoring.current=true;setPage(next);if(restoreFrame.current!==null)cancelAnimationFrame(restoreFrame.current);restoreFrame.current=requestAnimationFrame(()=>{scroll.current?.scrollTo({y:next==='main'?mainOffset.current:0,animated:false});restoreFrame.current=requestAnimationFrame(()=>{restoring.current=false;restoreFrame.current=null})})};
 const types=event?.ticketTypes.filter(t=>getTicketAvailability(t,Date.now())==='available')??[],selected=types.find(t=>t.id===tier);
 useEffect(()=>{if(!tier&&types[0])setTier(types[0].id)},[tier,types]);
 const total=event&&selected&&ids.length?checkoutTotals(event,{[selected.id]:ids.length}):undefined;
 const transferable=plan?plan.giftPurchasesAvailable!==false:!!event&&event.giftPurchasesAvailable!==false&&Date.parse(event.startTime)>Date.now();
 useEffect(()=>{if(currentTask.current===taskScope)return;currentTask.current=taskScope;setIds(!friendsOnly&&plan?.members.some(member=>member.userId===actor&&member.status==='accepted'&&member.ticketState==='none'&&member.hasTicket===false)?[actor]:[]);setTier('');setExtra(false);setRecovery(undefined);setError('outings.v2.destinationChanged')},[taskScope]);
 const selectable=(member:OutingPlan['members'][number])=>!recipientHasPendingAccess(member)&&(member.userId===actor||transferable);
 const withoutTickets=eligible.filter(member=>member.ticketState==='none'&&member.hasTicket===false&&selectable(member));
 const eligibleKey=eligible.map(member=>member.userId+':'+member.ticketState+':'+selectable(member)).join('|');
 useEffect(()=>{setIds(previous=>{const kept=previous.filter(id=>eligible.some(member=>member.userId===id&&selectable(member)));return kept.length===previous.length?previous:kept});setExtra(false)},[eligibleKey]);
 const warning=ids.some(id=>eligible.some(m=>m.userId===id&&(m.ticketState==='valid'||m.hasTicket===true)));
 const unknown=ids.some(id=>eligible.some(m=>m.userId===id&&(m.ticketState===undefined||m.ticketState==='unknown')));
 const valid=!!selected&&ids.length>0&&ids.length<=8&&getRemainingTicketCapacity(selected)>=ids.length&&ids.every(id=>eligible.some(m=>m.userId===id&&selectable(m)))&&(!(warning||unknown)||extra)&&(!plan||!!plan.decisionRound);
 const selection={...(plan?{planId:plan.id}:{}),decisionRound:plan?.decisionRound??0,recipientIds:ids,...(extra?{extraConfirmed:true}:{})};
 const continuePurchase=async()=>{
  if(!valid||!selected||busy||purchasePending.current||recovery||closeRequested.current||auth.controller.getToken()!==scopeToken.current)return;
  if(selected.priceRon>0){closeRequested.current=true;afterDismiss.current=()=>navigation.navigate('Checkout',{eventId:id,quantities:{[selected.id]:ids.length},outing:selection,recipientNames:ids.map(id=>eligible.find(m=>m.userId===id)!.username)});setClosing(true);return}
  purchasePending.current=true;setBusy(true);setError('');const token=auth.controller.getToken(),body={items:[{ticketTypeId:selected.id,quantity:ids.length}],outing:selection},fingerprint=JSON.stringify(body);
  if(freeKey.current?.fingerprint!==fingerprint)freeKey.current={fingerprint,key:randomUUID()};
  try{await accountApi('/events/'+id+'/tickets/book',{method:'POST',body,token,idempotencyKey:freeKey.current.key});if(!alive.current||closeRequested.current||auth.controller.getToken()!==token)return;
   void queryClient.invalidateQueries({queryKey:['tickets']});void queryClient.invalidateQueries({queryKey:['ticket-transfers']});closeRequested.current=true;afterDismiss.current=()=>{if(ids.every(person=>person!==actor))navigation.navigate('TicketTransfers');else openAccountPage(navigation,'Tickets')};setClosing(true);
  }catch(cause){if(alive.current&&!closeRequested.current&&auth.controller.getToken()===token){const action=outingCheckoutRecovery(cause);setRecovery(action);setError(action?.messageKey??'eventSheet.purchaseError')}}finally{purchasePending.current=false;if(alive.current)setBusy(false)}
 };
 const solo=eligible.length===1&&eligible[0]?.userId===actor&&!friendsOnly,pendingCount=pendingInvitations??plan?.members.filter(member=>member.status==='pending').length??0,forFriends=ids.some(person=>person!==actor);
 const footer=<View style={{gap:10}}>
  <View testID="outing-ticket-total" style={{gap:3}}><View style={[o.row,{justifyContent:'space-between'}]}><Text style={o.label}>{copy('checkout.total')}</Text><Text style={o.heading}>{formatRon(total?.total??0)}</Text></View>
   {!!total&&<Text style={o.caption}>{copy('checkout.ticketCount',{count:ids.length})} · {formatRon(total.subtotal??0)}{total.fee>0?' + '+formatRon(total.fee)+' '+copy('checkout.ticketingProcessingFee'):''}</Text>}
   {!ids.length&&<Text testID="outing-selection-hint" style={o.caption}>{copy('groups.ticketSelectionRequired')}</Text>}
  </View>
  {recovery?<OutingAction testID="outing-recipient-recovery" title={copy(recovery.actionKey)} onPress={()=>{closeRequested.current=true;afterDismiss.current=recovery.kind==='existing_payment'&&recovery.orderId?()=>onRecoverCheckout?void onRecoverCheckout(recovery.orderId!):navigation.navigate('CheckoutReturn',{eventId:id,nativeOrderId:recovery.orderId}):()=>{void queryClient.invalidateQueries({queryKey:['event',id]});onReviewSelection?.()};setClosing(true)}}/>:<OutingAction testID="outing-recipients-continue" title={copy('groups.continueTickets')} disabled={!valid||closing||page!=='main'} busy={busy} onPress={()=>void continuePurchase()}/>}
 </View>;
 const canChooseType=types.length>1||!selected&&types.length>0;
 const ticketSummary=<View style={[o.row,{minHeight:56,paddingHorizontal:12,paddingVertical:8,borderRadius:tokens.radius.field,backgroundColor:colors.raised,gap:12}]}>
  <Text style={[o.label,{flex:1,minWidth:0}]}>{selected?.name??copy('groups.ticketSelectionUnavailable')}</Text><Text style={[o.caption,{color:colors.text,textAlign:'right',maxWidth:'48%'}]}>{selected?copy('groups.pricePerPerson',{price:formatRon(selected.priceRon)}):''}</Text>{canChooseType&&<ChevronRight size={18} color={colors.muted}/>}
 </View>;
 return <GroupActionSheet testID="group-recipient-sheet" title={copy(page==='main'?'checkout.tickets':'groups.selectTicketType')} onBack={page==='types'?()=>showPage('main'):undefined} scrollRef={scroll} onScroll={event=>{if(page==='main'&&!restoring.current)mainOffset.current=event.nativeEvent.contentOffset.y}} closing={closing} contentEstimate={190+Math.min(8,eligible.length)*56} onRequestClose={()=>{closeRequested.current=true;afterDismiss.current=null;setClosing(true)}} onDismiss={()=>{if(dismissed.current||!alive.current)return;dismissed.current=true;const action=afterDismiss.current;afterDismiss.current=null;onClose();if(auth.controller.getToken()===scopeToken.current)action?.()}} footer={footer}>
  {page==='types'?<View testID="outing-ticket-types" style={{gap:4}}>{types.map(type=><OutingPressable key={type.id} testID={'outing-ticket-type-'+type.id} accessibilityRole="radio" aria-checked={selected?.id===type.id} accessibilityState={{checked:selected?.id===type.id,disabled:busy}} disabled={busy} onPress={()=>{setTier(type.id);setError('');showPage('main')}} style={[o.row,{minHeight:60,paddingVertical:10,gap:12}]}><View style={{flex:1,gap:3}}><Text style={o.label}>{type.name}</Text><Text style={o.caption}>{copy('groups.pricePerPerson',{price:formatRon(type.priceRon)})}</Text></View>{selected?.id===type.id&&<Check size={20} color={colors.accent}/>}</OutingPressable>)}</View>:<View testID="outing-ticket-main" style={{gap:20}}>
   {event&&<View testID="outing-ticket-context" style={[o.row,{gap:12}]}><EventImage uri={event.bannerUrl} fallback="neutral" style={{width:56,height:64,borderRadius:12}}/><View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={2} style={o.label}>{event.title}</Text><Text style={o.caption}>{groupEventDate(event.startTime,language)}</Text><Text numberOfLines={1} style={o.caption}>{event.locationName}</Text></View></View>}
   {canChooseType?<OutingPressable testID="outing-select-ticket-type" accessibilityLabel={copy('groups.selectTicketType')} disabled={busy} onPress={()=>showPage('types')}>{ticketSummary}</OutingPressable>:ticketSummary}
   <View style={{gap:6}}>
    <View style={[o.row,{justifyContent:'space-between',gap:8,flexWrap:'wrap'}]}><Text style={o.label}>{copy(solo?'groups.ticketsForYou':'groups.ticketsForWho')}</Text>{!!plan&&eligible.length>1&&withoutTickets.length>0&&<OutingAction title={copy('groups.selectWithoutTicketsShort')} accessibilityLabel={copy('groups.selectWithoutTickets')} size="compact" tone="ghost" onPress={()=>{setExtra(false);setIds(withoutTickets.slice(0,8).map(m=>m.userId))}}/>}</View>
    {eligible.length>8&&<Text style={o.caption}>{copy('groups.ticketRecipientLimit',{count:8})}</Text>}
    {!transferable&&eligible.some(member=>member.userId!==actor)&&<Text style={o.caption}>{copy('outings.v2.giftWindowClosed')}</Text>}
    {eligible.map(member=>{const checked=ids.includes(member.userId),disabled=busy||!selectable(member)||ids.length>=8&&!checked,isMe=member.userId===actor,ticketState=member.ticketState??(member.hasTicket===true?'valid':'unknown');return <OutingPressable key={member.userId} testID={'outing-recipient-'+member.userId} accessibilityRole="checkbox" accessibilityLabel={member.username} aria-checked={checked} accessibilityState={{checked,disabled}} disabled={disabled} style={[o.row,{minHeight:56,gap:12,paddingVertical:8,opacity:disabled?.5:1}]} onPress={()=>{setExtra(false);setIds(rows=>rows.includes(member.userId)?rows.filter(id=>id!==member.userId):rows.length<8?[...rows,member.userId]:rows)}}>
     <MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId} size={36}/><View style={{flex:1,minWidth:0,gap:3}}><Text style={o.label}>{member.username}{isMe?' · '+copy('groups.ticketsYou'):''}</Text>{ticketState!=='none'&&<Text style={o.caption}>{copy(groupTicketLabel(ticketState))}</Text>}</View><View style={{width:24,height:24,borderRadius:12,borderWidth:1,borderColor:checked?colors.accent:colors.line,alignItems:'center',justifyContent:'center'}}>{checked&&<Check size={16} color={colors.accent}/>}</View>
    </OutingPressable>})}
    {pendingCount>0&&<Text testID="outing-pending-invitations" style={o.caption}>{copy('groups.invitedCount',{count:pendingCount})}</Text>}
   </View>
   {!plan&&people.isError&&<OutingAction title={copy('common.retry')} onPress={()=>void people.refetch()}/>}
   {(warning||unknown)&&<View style={{gap:8}}><Text style={o.caption}>{copy(warning?'groups.extraHint':'groups.unknownTicketConfirm')}</Text><OutingPressable testID="outing-extra-confirmation" accessibilityRole="checkbox" aria-checked={extra} accessibilityState={{checked:extra}} onPress={()=>setExtra(!extra)} style={[o.row,{minHeight:44}]}>{extra&&<Check size={18} color={colors.accent}/>}<Text style={[o.caption,{flex:1}]}>{copy('groups.extra')}</Text></OutingPressable></View>}
   {!!(query.isError||error)&&<><Text accessibilityRole="alert" style={o.error}>{copy(error||'feedback.loadFailed')}</Text>{query.isError&&<OutingAction title={copy('common.retry')} onPress={()=>void query.refetch()}/>}</>}
   {!query.isPending&&(!types.length||!!tier&&!selected)&&<Text style={o.caption}>{copy('checkout.selectionUnavailable')}</Text>}
   {forFriends&&<Text style={o.caption}>{copy('outings.v2.recipientsHint')}</Text>}
  </View>}
 </GroupActionSheet>;
}
