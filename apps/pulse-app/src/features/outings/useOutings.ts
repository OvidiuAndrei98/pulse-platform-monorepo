"use client";
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ApiClient } from '@packages/api-client/client';
import type { paths } from '@packages/api-client/schema';
import { OutingsStore, type OutingsRequest } from '@packages/app-core/outings/model';
import { useDataProvider } from '@/core/DataProviderContext';
import { startVisiblePolling } from '@/lib/visiblePolling';

export function useOutings(scope:'plans'|'transfers'='plans') {
  const auth=useDataProvider(),actor=auth.user?.properties.id,token=auth.getToken(),current=useRef(auth);current.current=auth;
  const store=useMemo(()=>{
    const request:OutingsRequest=async(path,method,body,signal)=>{
      const url=new URL(path,'https://local.invalid');
      const params:{path?:Record<string,string>;query?:Record<string,string>}={query:Object.fromEntries(url.searchParams)};
      let route=url.pathname;
      const plan=route.match(/^\/outings\/plans\/([^/]+)(\/.*)?$/),transfer=route.match(/^\/outings\/transfers\/([^/]+)\/respond$/);
      const event=route.match(/^\/events\/([^/]+)$/);
      if(event){params.path={id:event[1]};route='/events/{id}';}
      if(plan){params.path={planID:plan[1]};route='/outings/plans/{planID}'+(plan[2]??'');}
      if(transfer){params.path={transferID:transfer[1]};route='/outings/transfers/{transferID}/respond';}
      const options={params,body,signal,cache:'no-store' as const};
      return method==='GET'?ApiClient.instance.get(route as keyof paths,options as never):ApiClient.instance.post(route as keyof paths,options as never);
    };
    return new OutingsStore(request,()=>!!actor&&!!token&&current.current.user?.properties.id===actor&&current.current.getToken()===token,()=>crypto.randomUUID(),scope);
  },[actor,token,scope]);
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  useEffect(()=>{store.activate();if(actor)void store.load();const stop=actor?startVisiblePolling(()=>store.load(true),20_000):()=>{};return()=>{stop();store.dispose();};},[store,actor]);
  return {...state,store,user:auth.user,ready:!auth.loading};
}
