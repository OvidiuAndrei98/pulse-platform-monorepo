import React,{useState,useEffect,useRef} from 'react';
import {View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQuery} from '@tanstack/react-query';
import {randomUUID} from 'expo-crypto';
import {Check} from 'lucide-react-native';
import {automaticPlanRecipients,eligiblePlanRecipients,recipientHasPendingAccess} from '@packages/app-core/outings/experience';
import {groupTicketLabel} from '@packages/app-core/social/groups';
import {getTicketAvailability,getRemainingTicketCapacity} from '@packages/app-core/checkout/ticketAvailability';
import {checkoutTotals} from '@packages/app-core/checkout/totals';
import {formatRon} from '@packages/app-core/events/serviceFee';
import type {OutingPlan,PlanFriend} from '@packages/app-core/outings/model';
import {useEvent,queryClient} from '../data/queries';
import {accountApi,useAuth} from '../auth/AuthProvider';
import {AppSheet} from '../ui/AppSheet';
import {AppSheetScrollView} from '../ui/AppSheetScrollView';
import {Text} from '../ui/Text';
import {usePreferences} from '../usePreferences';
import {DashboardDropdown} from '../dashboard/DashboardDropdown';
import {MemberAvatar,OutingPressable,OutingAction} from './OutingPrimitives';
import {o} from './outingsStyles';
import {colors} from '../ui/theme';

type Props={plan?:OutingPlan;eventId?:string;actor:string;onClose:()=>void;friendsOnly?:boolean};
export function PlanTicketRecipients({plan,eventId,actor,onClose,friendsOnly=false}:Props){
 const {copy}=usePreferences(),navigation=useNavigation<any>(),auth=useAuth('account');
 const id=plan?.chosenEventId??eventId??'',query=useEvent(id),event=query.data;
 const people=useQuery({queryKey:['gift-friends',actor],enabled:!plan,queryFn:({signal})=>accountApi<PlanFriend[]>('/friends',{signal})});
 const eligible:OutingPlan['members']=plan?eligiblePlanRecipients(plan):[
  {userId:actor,username:auth.user?.username??'',status:'accepted',ticketState:'unknown'},
  ...(people.data??[]).map(friend=>({userId:friend.id,username:friend.username,avatarUrl:friend.avatarUrl,status:'accepted' as const,ticketState:'unknown' as const})),
 ];
 const [ids,setIds]=useState<string[]>(()=>!friendsOnly&&plan?.members.some(m=>m.userId===actor&&m.hasTicket===false&&!recipientHasPendingAccess(m))?[actor]:[]);
 const [tier,setTier]=useState(''),[extra,setExtra]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const freeKey=useRef<{fingerprint:string;key:string}|null>(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const types=event?.ticketTypes.filter(t=>getTicketAvailability(t,Date.now())==='available')??[],selected=types.find(t=>t.id===tier);
 useEffect(()=>{if(!tier&&types[0])setTier(types[0].id)},[tier,types]);
 const total=event&&selected&&ids.length?checkoutTotals(event,{[selected.id]:ids.length}):undefined;
 const transferable=plan?plan.giftPurchasesAvailable!==false:!!event&&event.giftPurchasesAvailable!==false&&Date.parse(event.startTime)>Date.now();
 const selectable=(member:OutingPlan['members'][number])=>!recipientHasPendingAccess(member)&&(member.userId===actor||transferable);
 const warning=ids.some(id=>eligible.some(m=>m.userId===id&&m.hasTicket));
 const valid=!!selected&&ids.length>0&&ids.length<=8&&getRemainingTicketCapacity(selected)>=ids.length&&ids.every(id=>eligible.some(m=>m.userId===id&&selectable(m)))&&(!warning||extra)&&(!plan||!!plan.decisionRound);
 const selection={...(plan?{planId:plan.id}:{}),decisionRound:plan?.decisionRound??0,recipientIds:ids,...(extra?{extraConfirmed:true}:{})};
 const continuePurchase=async()=>{
  if(!valid||!selected||busy)return;
  if(selected.priceRon>0){onClose();navigation.navigate('Checkout',{eventId:id,quantities:{[selected.id]:ids.length},outing:selection,recipientNames:ids.map(id=>eligible.find(m=>m.userId===id)!.username)});return}
  setBusy(true);setError('');const token=auth.controller.getToken(),body={items:[{ticketTypeId:selected.id,quantity:ids.length}],outing:selection},fingerprint=JSON.stringify(body);
  if(freeKey.current?.fingerprint!==fingerprint)freeKey.current={fingerprint,key:randomUUID()};
  try{await accountApi('/events/'+id+'/tickets/book',{method:'POST',body,token,idempotencyKey:freeKey.current.key});if(!alive.current||auth.controller.getToken()!==token)return;
   void queryClient.invalidateQueries({queryKey:['tickets']});void queryClient.invalidateQueries({queryKey:['ticket-transfers']});onClose();navigation.navigate(ids.every(person=>person!==actor)?'TicketTransfers':'Tickets');
  }catch(cause){if(alive.current)setError((cause as {code?:string}).code==='TICKET_GIFT_WINDOW_CLOSED'?'outings.v2.giftWindowClosed':'outings.v2.recipientChanged')}finally{if(alive.current)setBusy(false)}
 };
 return <AppSheet open onClose={onClose} label={copy('outings.v2.recipients')} height={0.8}><AppSheetScrollView contentContainerStyle={{padding:20,paddingBottom:40,gap:18}}>
  <Text style={o.heading}>{copy('outings.v2.recipients')}</Text><Text style={o.caption}>{event?.title}</Text><Text style={o.caption}>{copy('outings.v2.recipientsHint')}</Text>
  {!transferable&&<Text style={o.caption}>{copy('outings.v2.giftWindowClosed')}</Text>}
  {eligible.map(member=>{const disabled=busy||!selectable(member),checked=ids.includes(member.userId);return <OutingPressable key={member.userId} testID={'outing-recipient-'+member.userId} accessibilityRole="checkbox" accessibilityLabel={member.username} accessibilityState={{checked,disabled}} disabled={disabled} style={[o.row,{minHeight:60,opacity:disabled?.5:1}]} onPress={()=>{setExtra(false);setIds(rows=>rows.includes(member.userId)?rows.filter(id=>id!==member.userId):[...rows,member.userId])}}>
   <MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId}/><View style={{flex:1,gap:4}}><Text style={o.label}>{member.username}</Text><Text style={o.caption}>{copy(groupTicketLabel(member.ticketState??(member.hasTicket?'valid':member.hasTicket===false?'none':'unknown')))}</Text>{member.attendance==='no'&&<Text style={o.caption}>{copy('groups.no')}</Text>}</View><View style={{width:24,height:24,borderRadius:12,borderWidth:1,borderColor:checked?colors.accent:colors.line,alignItems:'center',justifyContent:'center'}}>{checked&&<Check size={16} color={colors.accent}/>}</View>
  </OutingPressable>})}
  {!!plan&&<OutingAction title={copy('outings.v2.selectNeeds')} tone="ghost" onPress={()=>{setExtra(false);setIds(automaticPlanRecipients(plan).filter(selectable).map(m=>m.userId))}}/>}
  {!plan&&people.isError&&<OutingAction title={copy('common.retry')} onPress={()=>void people.refetch()}/>}
  {(warning||!plan)&&<View style={{gap:8}}>{warning&&<Text style={o.caption}>{copy('groups.extraHint')}</Text>}<OutingPressable testID="outing-extra-confirmation" accessibilityRole="checkbox" accessibilityState={{checked:extra}} onPress={()=>setExtra(!extra)} style={[o.row,{minHeight:44}]}>{extra&&<Check size={18} color={colors.accent}/>}<Text style={[o.caption,{flex:1}]}>{copy('groups.extra')}</Text></OutingPressable></View>}
  <DashboardDropdown label={copy('checkout.tickets')} value={selected?.id??''} options={types.map(t=>({value:t.id,label:t.name+' · '+formatRon(t.priceRon)}))} onChange={setTier} placeholder={copy('checkout.tickets')}/>
  {(query.isError||error)&&<><Text accessibilityRole="alert" style={o.error}>{copy(error||'feedback.loadFailed')}</Text><OutingAction title={copy('common.retry')} onPress={()=>void query.refetch()}/></>}
  {!query.isPending&&(!types.length||!!tier&&!selected)&&<Text style={o.caption}>{copy('checkout.selectionUnavailable')}</Text>}
  {total&&<Text style={o.heading}>{copy('checkout.total')} · {formatRon(total.total)}</Text>}
  <Text style={o.caption}>{copy('outings.v2.transferHint')}</Text>
  <OutingAction testID="outing-recipients-continue" title={copy(ids.length===1?'outings.v2.continueOne':'outings.v2.continue',{count:ids.length})} disabled={!valid} busy={busy} onPress={()=>void continuePurchase()}/>
 </AppSheetScrollView></AppSheet>;
}
