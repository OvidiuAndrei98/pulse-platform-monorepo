import React from 'react';
import {View} from 'react-native';
import {getTicketAvailability,ticketQuantityLimit} from '@packages/app-core/checkout/ticketAvailability';
import {formatRon} from '@packages/app-core/events/serviceFee';
import type {Event} from '../data/events';
import {StateSurface} from '../ui/StateMotion';
import {Text} from '../ui/Text';
import {TicketQuantityStepper} from '../ui/TicketQuantityStepper';
import {colors} from '../ui/theme';
import {usePreferences} from '../usePreferences';

export function EventTicketPicker({event,quantities,onStep,now,disabled,paidOnly=false}:{event:Event;quantities:Record<string,number>;onStep:(id:string,delta:number)=>void;now:number;disabled?:boolean;paidOnly?:boolean}) {
  const {copy}=usePreferences(),ended=Date.parse(event.endTime)<=now;
  const tickets=[...event.ticketTypes].filter(ticket=>!paidOnly||ticket.priceRon>0).sort((a,b)=>a.priceRon-b.priceRon);
  const firstAvailable=tickets.find(ticket=>getTicketAvailability(ticket,now)==='available')?.id;
  return <View style={{gap:10}}>
    {!paidOnly&&tickets.some(ticket=>ticket.priceRon===0)&&<Text style={{color:colors.muted,fontSize:12,lineHeight:18}}>{copy('checkout.freeIndividualBooking')}</Text>}
    {tickets.map(ticket=>{
      const status=getTicketAvailability(ticket,now),enabled=!ended&&status==='available',value=quantities[ticket.id]??0;
      const statusKey=status==='sold-out'?'checkout.soldOut':status==='sales-not-started'?'checkout.salesNotStarted':'checkout.salesEnded';
      return <StateSurface key={ticket.id} testID={'event-ticket-'+ticket.id} background={value>0?'#ff00441a':colors.surface} border={value>0?colors.accent:colors.inputBorder} style={{borderWidth:1,borderRadius:16,padding:16,gap:12}}>
        <View style={{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:12}}><View style={{flex:1,minWidth:0,gap:5}}><Text style={{color:colors.text,fontSize:14,fontWeight:'600'}}>{ticket.name}</Text>{!!ticket.description&&<Text style={{color:colors.muted,fontSize:12,lineHeight:19}}>{ticket.description}</Text>}</View><Text style={{color:enabled?colors.accent:colors.muted,fontSize:13,fontWeight:'600',maxWidth:'45%'}}>{enabled?(ticket.priceRon===0?copy('checkout.free'):formatRon(ticket.priceRon)):copy(statusKey)}</Text></View>
        <View style={{alignSelf:'flex-end'}}><TicketQuantityStepper name={ticket.name} value={enabled?value:0} maximum={ticketQuantityLimit(event.ticketTypes,quantities,ticket.id,now)} disabled={disabled||!enabled} onStep={delta=>onStep(ticket.id,delta)} testIDPrefix={paidOnly&&ticket.id===firstAvailable?'checkout':(paidOnly?'checkout-ticket-':'event-ticket-')+ticket.id}/></View>
      </StateSurface>;
    })}
  </View>;
}
