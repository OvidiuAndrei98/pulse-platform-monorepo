import React,{useEffect,useRef,useState} from 'react';
import {View} from 'react-native';
import type {GroupMessage} from '@packages/app-core/social/groups';
import {groupNightDate,groupUpdateSummary} from '@packages/app-core/social/groupPresentation';
import {OutingPressable} from '../outings/OutingPrimitives';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
import {usePreferences} from '../usePreferences';
import {groupStyles as g} from './groupStyles';

/** A bounded view of stored versions, never a reconstruction from today's plan. */
export function GroupOutingHistory({planId,messages,more,onMore}:{planId:string;messages:readonly GroupMessage[];more:boolean;onMore:()=>Promise<unknown>}){
 const {copy,language}=usePreferences('copy'),[open,setOpen]=useState(false),[limit,setLimit]=useState(20),[loading,setLoading]=useState(false),alive=useRef(true),pending=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const entries=messages.filter(message=>message.outingId===planId&&message.kind==='outing').sort((a,b)=>b.seq-a.seq);
 const loadMore=async()=>{
  if(pending.current)return;
  if(entries.length>limit){setLimit(value=>value+20);return}
  pending.current=true;setLoading(true);
  try{await onMore()}finally{pending.current=false;if(alive.current)setLoading(false)}
 };
 return <View testID="group-outing-history" style={{gap:12}}>
  <OutingPressable testID="group-open-history" accessibilityState={{expanded:open}} onPress={()=>setOpen(value=>!value)} style={{minHeight:44,justifyContent:'center'}}><Text style={g.muted}>{copy(open?'groups.historyHide':'groups.historyDetails')}</Text></OutingPressable>
  {open&&<View testID="group-history-entries" style={{gap:16}}>
   {entries.slice(0,limit).map(message=>{
    const previous=messages.find(item=>item.outingId===planId&&item.seq+1===message.seq),context=message.outingContext;
    const date=Date.parse(message.createdAt);
    return <View key={message.id} testID={'group-history-entry-'+message.id} style={{gap:4}}>
     <Text style={g.body}>{groupUpdateSummary(message,previous,language,copy)}</Text>
     {!!context&&<Text style={g.caption}>{[context.title!==context.outingDate?context.title:undefined,groupNightDate(context.outingDate,language),context.city].filter(Boolean).join(' · ')}</Text>}
     {Number.isFinite(date)&&<Text style={g.caption}>{new Date(date).toLocaleString(language,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</Text>}
    </View>;
   })}
   {(entries.length>limit||more)&&<ActionButton testID="group-history-more" title={copy('groups.older')} tone="ghost" busy={loading} onPress={()=>void loadMore()}/>}
  </View>}
 </View>;
}
