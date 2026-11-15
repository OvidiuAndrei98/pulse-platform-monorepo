import React,{useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import type {OutingPlan} from '@packages/app-core/outings/model';
import {GroupNightForm} from './GroupNightForm';
import {GroupActionSheet} from './GroupActionSheet';
import {useGroups} from './useGroups';
import {usePreferences} from '../usePreferences';
import {ActionButton} from '../ui/ActionButton';

/** The one editor used by outing detail and its event picker. */
export function GroupNightSheet({model,groupId,plan,onClose,onSaved}:{model:ReturnType<typeof useGroups>;groupId:string;plan:OutingPlan;onClose:()=>void;onSaved?:(id:string)=>void}){
 const {copy}=usePreferences(),[closing,setClosing]=useState(false),saved=useRef<string|null>(null),isClosing=useRef(false);
 const alive=useRef(true),dismissed=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;saved.current=null}},[]);
 const close=()=>{isClosing.current=true;model.store.resetContextFeedback();setClosing(true)};
 return <GroupNightForm model={model} groupId={groupId} plan={plan} active={!closing} onCreated={id=>{if(isClosing.current||!alive.current)return;saved.current=id;close()}} renderShell={(body,footer)=><GroupActionSheet testID="group-night-editor" title={copy('groups.editNight')} height={.6} closing={closing} onRequestClose={close} onDismiss={()=>{if(!alive.current||dismissed.current)return;dismissed.current=true;isClosing.current=true;const id=saved.current;saved.current=null;onClose();if(id)onSaved?.(id)}} footer={<View style={{gap:8}}>{footer}<ActionButton testID="group-edit-night-cancel" title={copy('common.cancel')} tone="ghost" onPress={close}/></View>}>{body}</GroupActionSheet>}/>;
}
