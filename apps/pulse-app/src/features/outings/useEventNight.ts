"use client";
import {useEffect} from 'react';
import {ApiClient,type ReadableSchema} from '@packages/api-client/client';
import {useDataProvider} from '@/core/DataProviderContext';
import {useCachedClientQuery} from '@/lib/useCachedClientQuery';
import {startVisiblePolling} from '@/lib/visiblePolling';
import {eventNightTickets} from '@packages/app-core/outings/model';

/** Operational event services survive retirement of event conversations. */
export function useEventNight(eventId:string){
 const auth=useDataProvider(),actor=auth.user?.properties.id;
 const tickets=useCachedClientQuery<ReadableSchema<'UserTicketResponse'>[]>(actor?'night-tickets:'+actor:null,()=>ApiClient.instance.get('/users/me/tickets',{cache:'no-store'}),[]);
 const event=useCachedClientQuery<ReadableSchema<'EventResponse'>|null>(actor?'night-event:'+actor+':'+eventId:null,()=>ApiClient.instance.get('/events/{id}',{params:{path:{id:eventId}},cache:'no-store'}),null);
 const updates=useCachedClientQuery<ReadableSchema<'OrganizerEventUpdateResponse'>[]>(actor?'night-updates:'+actor+':'+eventId:null,()=>ApiClient.instance.get('/events/{id}/updates',{params:{path:{id:eventId}},cache:'no-store'}),[]);
 useEffect(()=>{if(!actor)return;return startVisiblePolling(async()=>{tickets.retry();updates.retry()},8000)},[actor,eventId,tickets.retry,updates.retry]);
 return {tickets,event,updates,owned:eventNightTickets(tickets.data,eventId),user:auth.user};
}
