import React,{useEffect,useRef,useState} from 'react';
import {GroupActionSheet} from '../groups/GroupActionSheet';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
import {usePreferences} from '../usePreferences';
import {groupStyles} from '../groups/groupStyles';

type Props={model:{canCancel:boolean;busy:boolean;cancel:()=>Promise<boolean>};onClosed:()=>void};
/** Release only the explicitly confirmed unfinished checkout. Dismiss the
 * confirmation surface before the request can navigate to a paid receipt. */
export function CheckoutReservationActions({model,onClosed}:Props){
 const {copy}=usePreferences('copy'),[open,setOpen]=useState(false),[closing,setClosing]=useState(false),confirmed=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;confirmed.current=false}},[]);
 if(!model.canCancel)return null;
 return <>
  <ActionButton testID="checkout-close-reservation" title={copy('groups.closeCheckout')} tone="ghost" size="compact" disabled={model.busy} onPress={()=>{confirmed.current=false;setClosing(false);setOpen(true)}}/>
  {open&&<GroupActionSheet testID="checkout-close-reservation-sheet" title={copy('groups.closeCheckout')} contentEstimate={100} closing={closing} onRequestClose={()=>{confirmed.current=false;setClosing(true)}} onDismiss={()=>{if(!alive.current)return;const run=confirmed.current;confirmed.current=false;setOpen(false);setClosing(false);if(run)void model.cancel().then(closed=>{if(closed&&alive.current)onClosed()})}} footer={<ActionButton testID="checkout-confirm-close-reservation" title={copy('groups.closeCheckout')} onPress={()=>{confirmed.current=true;setClosing(true)}}/>}><Text style={groupStyles.muted}>{copy('groups.closeCheckoutHint')}</Text></GroupActionSheet>}
 </>;
}
