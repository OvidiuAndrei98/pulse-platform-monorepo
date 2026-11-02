import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { randomUUID } from 'expo-crypto';
import { OutingsStore, type OutingsRequest } from '@packages/app-core/outings/model';
import { accountApi, useAuth } from '../auth/AuthProvider';

export function useOutings() {
  const auth=useAuth(), focused=useIsFocused(), actor=auth.user?.id, token=auth.controller.getToken();
  const store=useMemo(()=> {
    const request: OutingsRequest=(path,method,body,signal)=>accountApi(path,{method,body,signal,token:token??null});
    return new OutingsStore(request,()=>!!actor&&!!token&&auth.controller.getToken()===token&&auth.controller.getSnapshot().user?.id===actor,randomUUID);
  },[actor,token,auth.controller]);
  const state=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  useEffect(()=>{store.activate();return()=>store.dispose();},[store]);
  useEffect(()=>{
    if(!focused||!auth.ready||!actor)return;
    const refresh=()=>{if(AppState.currentState!=='background'&&AppState.currentState!=='inactive'&&(Platform.OS!=='web'||document.visibilityState!=='hidden'))void store.load(true);};
    void store.load();const timer=setInterval(refresh,20_000),subscription=AppState.addEventListener('change',refresh);
    if(Platform.OS==='web')document.addEventListener('visibilitychange',refresh);
    return()=>{clearInterval(timer);subscription.remove();if(Platform.OS==='web')document.removeEventListener('visibilitychange',refresh);};
  },[store,focused,auth.ready,actor]);
  return {...state,store,user:auth.user,ready:auth.ready};
}
