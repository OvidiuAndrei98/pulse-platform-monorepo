"use client";
import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {GroupsStore} from '@packages/app-core/social/groups';
import {ApiClient} from '@packages/api-client/client';
import type {paths} from '@packages/api-client/schema';
import {useDataProvider} from '@/core/DataProviderContext';
import {startVisiblePolling} from '@/lib/visiblePolling';
import {groupSession} from '@/lib/groupsSession';
export function useGroups(groupId?:string){
 const auth=useDataProvider(),actor=auth.user?.properties.id,token=auth.getToken(),current=useRef(auth);current.current=auth;
 const store=useMemo(()=>{
  const key=(actor??'')+':'+(token??'');return groupSession(key,()=>new GroupsStore(async(path,method,body,signal)=>{
   const url=new URL(path,'https://local.invalid'),params:{path?:Record<string,string>;query:Record<string,string>}={query:Object.fromEntries(url.searchParams)};let route=url.pathname;
   const group=route.match(/^\/outings\/groups\/([^/]+)(\/.*)?$/),plan=route.match(/^\/outings\/plans\/([^/]+)(\/.*)?$/);
   if(group){params.path={groupID:group[1]};route='/outings/groups/{groupID}'+(group[2]??'')}
   if(plan){params.path={planID:plan[1]};route='/outings/plans/{planID}'+(plan[2]??'')}
   const options={params,body,signal,cache:'no-store' as const};return method==='GET'?ApiClient.instance.get(route as keyof paths,options as never):ApiClient.instance.post(route as keyof paths,options as never);
  },()=>current.current.user?.properties.id===actor&&current.current.getToken()===token,()=>crypto.randomUUID()));
 },[actor,token]);
 const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
 useEffect(()=>{if(!actor)return;void store.load(groupId);return startVisiblePolling(()=>store.load(groupId),5000)},[store,actor,groupId]);
 return {...state,store,user:auth.user,ready:!auth.loading};
}
