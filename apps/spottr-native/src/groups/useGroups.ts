import {useEffect,useMemo,useSyncExternalStore} from 'react';
import {AppState,Platform} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {randomUUID} from 'expo-crypto';
import {GroupsStore} from '@packages/app-core/social/groups';
import {accountApi,useAuth} from '../auth/AuthProvider';
import {sessionGroupStore} from './session';
export function useGroups(groupId?:string){
 const auth=useAuth('account'),token=auth.controller.getToken(),actor=auth.user?.id,focused=useIsFocused();
 const store=useMemo(()=>{
  const key=(actor??'')+':'+(token??'');return sessionGroupStore(key,()=>new GroupsStore((path,method,body,signal)=>accountApi(path,{method,body,signal,token}),()=>auth.controller.getSnapshot().user?.id===actor&&auth.controller.getToken()===token,randomUUID));
 },[actor,token,auth.controller]);
 const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
 useEffect(()=>{
  if(!focused||!actor)return;const refresh=()=>{if(AppState.currentState!=='background'&&AppState.currentState!=='inactive'&&(Platform.OS!=='web'||document.visibilityState!=='hidden'))void store.load(groupId)};
  refresh();const timer=setInterval(refresh,5000),sub=AppState.addEventListener('change',refresh);return()=>{clearInterval(timer);sub.remove()};
 },[store,groupId,focused,actor]);
 return {...state,store,user:auth.user,ready:auth.ready};
}
