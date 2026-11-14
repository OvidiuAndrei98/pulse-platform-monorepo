"use client";
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useDataProvider} from '@/core/DataProviderContext';
import {ActionButton} from '@/components/ui/ActionButton';
import {PlanTicketRecipients} from '@/features/outings/PlanTicketRecipients';
export function EventFriendTickets({eventId}:{eventId:string}){
 const {user}=useDataProvider(),{t}=useTranslation(),[open,setOpen]=useState(false);
 if(!user)return null;
 return <><ActionButton tone="ghost" onClick={()=>setOpen(true)}>{t('outings.v2.friendsTickets')}</ActionButton>{open&&<PlanTicketRecipients eventId={eventId} friendsOnly actor={user.properties.id} onClose={()=>setOpen(false)}/>}</>;
}
