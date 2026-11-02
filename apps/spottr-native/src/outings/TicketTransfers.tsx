import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { canOfferTransfer, type TicketTransfer } from '@packages/app-core/outings/model';
import { useTickets } from '../data/useTickets';
import { ticketCache } from '../data/ticketStorage';
import { ActionButton } from '../ui/ActionButton';
import { FormInput } from '../ui/FormInput';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { Choice } from './PlanBuilder';
import type { useOutings } from './useOutings';

export function TicketTransfers({model,initialTicketId,onTickets}:{model:ReturnType<typeof useOutings>;initialTicketId?:string;onTickets:()=>void}) {
  const {copy}=usePreferences(),tickets=useTickets(true,true),client=useQueryClient();
  const [selected,setSelected]=useState(initialTicketId??''),[email,setEmail]=useState(''),[confirmed,setConfirmed]=useState(false);
  const eligible=tickets.data?.filter(t=>canOfferTransfer(t))??[],ticket=eligible.find(t=>t.id===selected);
  useEffect(()=>{if(initialTicketId)setSelected(initialTicketId);},[initialTicketId]);
  const invalidate=async()=>{
    if(model.user)await ticketCache.remove(model.user.id).catch(()=>{});
    await client.invalidateQueries({queryKey:['tickets',model.user?.id]});
  };
  const send=async()=>{
    if(!ticket||!confirmed)return;
    const payload={ticketId:ticket.id,recipientEmail:email.trim().toLowerCase()};
    const result=await model.store.createTransfer(payload.ticketId,payload.recipientEmail);
    if(result){setSelected('');setEmail('');setConfirmed(false);await invalidate();}
  };
  const respond=async(id:string,status:'accepted'|'declined'|'cancelled')=>{if(await model.store.respondTransfer(id,status))await invalidate();};
  return <View style={{gap:18}}>
    <Text style={{color:colors.muted}}>{copy('outings.financialHint')}</Text>
    {model.transfers.map(x=><View key={x.id} testID={'transfer-'+x.id} style={{padding:18,borderWidth:1,borderColor:colors.line,borderRadius:24,gap:10}}>
      <Text style={{color:colors.text,fontSize:18,fontWeight:'600'}}>{x.eventTitle}</Text>
      <Text style={{color:colors.muted}}>{x.senderId===model.user?.id?x.recipientName||copy('outings.to'):copy('outings.from',{name:x.senderName})}</Text>
      <Text style={{color:colors.muted}}>{copy('outings.'+x.status)}</Text>
      {x.status==='pending'&&(x.senderId===model.user?.id
        ?<ActionButton title={copy('outings.cancel')} tone="secondary" disabled={model.working} onPress={()=>void respond(x.id,'cancelled')}/>
        :<><ActionButton testID={'transfer-accept-'+x.id} title={copy('outings.acceptTransfer')} disabled={model.working} onPress={()=>void respond(x.id,'accepted')}/><ActionButton title={copy('outings.decline')} tone="secondary" disabled={model.working} onPress={()=>void respond(x.id,'declined')}/></>)}
    </View>)}
    {!model.transfers.length&&<Text style={{color:colors.muted}}>{copy('outings.emptyTransfers')}</Text>}
    <Text style={{color:colors.text,fontSize:20,fontWeight:'600'}}>{copy('outings.transferTitle')}</Text>
    <Text style={{color:colors.muted}}>{copy('outings.transferHint')}</Text>
    <Text style={{color:colors.muted,fontSize:12}}>{copy('outings.cutoffHint')}</Text>
    {eligible.map(t=><Choice key={t.id} title={t.eventTitle+' · '+t.ticketTypeName} hint={t.id.slice(0,8)} selected={selected===t.id} disabled={model.working} onPress={()=>{setSelected(t.id);setConfirmed(false);}}/>)}
    {ticket&&<>
      <FormInput testID="transfer-email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} editable={!model.working} placeholder={copy('outings.email')} accessibilityLabel={copy('outings.email')}/>
      <Choice title={copy('outings.confirmTransfer')} selected={confirmed} disabled={model.working} onPress={()=>setConfirmed(v=>!v)}/>
      <ActionButton testID="transfer-send" title={copy('outings.send')} busy={model.working} disabled={!confirmed||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())||email.trim().toLowerCase()===model.user?.email.toLowerCase()} onPress={()=>void send()}/>
    </>}
    <ActionButton title={copy('outings.openTickets')} tone="secondary" onPress={onTickets}/>
  </View>;
}
