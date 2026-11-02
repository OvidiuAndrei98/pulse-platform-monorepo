"use client";
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient, type ReadableSchema } from '@packages/api-client/client';
import { useDataProvider } from '@/core/DataProviderContext';
import { useCachedClientQuery } from '@/lib/useCachedClientQuery';
import { startVisiblePolling } from '@/lib/visiblePolling';
import { eventNightTickets, outingFailure } from '@packages/app-core/outings/model';

export function useEventNight(eventId:string) {
  const {t}=useTranslation();
  const auth=useDataProvider(),actor=auth.user?.properties.id,token=auth.getToken(),current=useRef(auth),mounted=useRef(true);current.current=auth;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const active=()=>mounted.current&&!!actor&&current.current.user?.properties.id===actor&&current.current.getToken()===token;
  const tickets=useCachedClientQuery<ReadableSchema<'UserTicketResponse'>[]>(actor?'night-tickets:'+actor:null,()=>ApiClient.instance.get('/users/me/tickets',{cache:'no-store'}),[]);
  const event=useCachedClientQuery<ReadableSchema<'EventResponse'>|null>(actor?'night-event:'+actor+':'+eventId:null,()=>ApiClient.instance.get('/events/{id}',{params:{path:{id:eventId}},cache:'no-store'}),null);
  const group=useCachedClientQuery<ReadableSchema<'EventSafetyGroupEnvelopeResponse'>|null>(actor?'night-group:'+actor+':'+eventId:null,()=>ApiClient.instance.get('/events/{id}/safety-group',{params:{path:{id:eventId}},cache:'no-store'}),null);
  const updates=useCachedClientQuery<ReadableSchema<'OrganizerEventUpdateResponse'>[]>(actor?'night-updates:'+actor+':'+eventId:null,()=>ApiClient.instance.get('/events/{id}/updates',{params:{path:{id:eventId}},cache:'no-store'}),[]);
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),lock=useRef(false);
  useEffect(()=>{if(!actor)return;return startVisiblePolling(async()=>{tickets.retry();group.retry();updates.retry();},8_000);},[actor,eventId,tickets.retry,group.retry,updates.retry]);
  const mutate=async(kind:'help'|'help-resolved'|'meeting',content:string)=>{
    if(lock.current||!active())return false;lock.current=true;setBusy(true);setError(null);
    try {
      if(kind==='meeting')await ApiClient.instance.post('/outings/meeting-point/{eventID}',{params:{path:{eventID:eventId}},body:{content}});
      else await ApiClient.instance.post(kind==='help-resolved'?'/events/{id}/safety-group/help-resolved':'/events/{id}/safety-group/help',{params:{path:{id:eventId}},body:{content}});
      if(active())group.retry();
      return active();
    }catch(cause){if(active())setError(outingFailure(cause));return false;}
    finally{if(active()){lock.current=false;setBusy(false);}}
  };
  const help=async(resolve=false)=>{await mutate(resolve?'help-resolved':'help',t(resolve?'safetyGroup.safeMessage':'safetyGroup.helpMessage'));};
  const saveMeeting=(content:string)=>mutate('meeting',content);
  return {tickets,event,group,updates,owned:eventNightTickets(tickets.data,eventId),busy,error,help,saveMeeting,user:auth.user};
}
