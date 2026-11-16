import React,{useEffect,useMemo} from 'react';
import {FlatList,View} from 'react-native';
import {useIsFocused,useNavigation} from '@react-navigation/native';
import {Plus} from 'lucide-react-native';
import {OutingSummary} from './GroupContent';
import {GroupEventReference} from './GroupEventReference';
import {groupSharedEventReferences} from '@packages/app-core/social/groupPresentation';
import {GroupAccess,GroupPage,g} from './GroupPage';
import {useGroups} from './useGroups';
import {usePreferences} from '../usePreferences';
import {ActionButton} from '../ui/ActionButton';
import {Feedback,Loading} from '../ui/common';
import {Text} from '../ui/Text';

export function GroupCollectionsScreen({groupId,kind}:{groupId:string;kind:'outings'|'shared'}){
 const model=useGroups(groupId),navigation=useNavigation<any>(),focused=useIsFocused(),{copy,language}=usePreferences();
 const group=model.groups.find(g=>g.id===groupId),accepted=group?.status==='accepted',outings=kind==='outings';
 const load=(older=false)=>outings?model.store.loadHistory(groupId,older):model.store.collection(groupId,older);
 useEffect(()=>{if(focused&&accepted)void load()},[focused,accepted,groupId,model.store,kind]);
 const status=(outings?model.historyStatus:model.collectionStatus)[groupId]??'idle',error=(outings?model.historyError:model.collectionError)[groupId],more=(outings?model.historyMore:model.collectionMore)[groupId];
 const plans=useMemo(()=>{
  const ended=(p:NonNullable<typeof group>['outings'][number])=>['completed','cancelled'].includes(p.lifecycle??'');
  const time=(p:NonNullable<typeof group>['outings'][number])=>Date.parse((p.outingDate??p.candidateDates?.[0]?.date)+'T12:00:00Z')||0;
  return [...(group?.outings??[])].sort((a,b)=>Number(ended(a))-Number(ended(b))+(ended(a)===ended(b)?(ended(a)?time(b)-time(a):time(a)-time(b)):0));
 },[group?.outings]);
 // Shares in different outings retain their own author, message and context.
 const shared=useMemo(()=>groupSharedEventReferences(model.collection[groupId]??[]),[model.collection[groupId]]);
 const prefix=outings?'group-outings':'group-shared';
 const empty=<View testID={prefix+'-empty'} style={{gap:12,paddingVertical:28}}><Text style={g.heading}>{copy(outings?'groups.emptyOutings':'groups.emptyShared')}</Text><Text style={g.muted}>{copy(outings?'groups.emptyOutingsHint':'groups.emptySharedHint')}</Text><ActionButton title={copy(outings?'groups.propose':'groups.findEvent')} tone="secondary" onPress={()=>navigation.navigate(outings?'GroupNewOuting':'GroupEventPicker',{groupId})}/></View>;
 const feedback=error?<View testID={prefix+'-error'}><Feedback compact title={copy(error)} retry={()=>void load()}/></View>:status==='loading'||status==='idle'?<View testID={prefix+'-loading'}><Loading/></View>:null;
 return <GroupPage groupId={groupId} testID={outings?'group-outings-page':'group-shared-page'} title={copy(outings?'groups.outings':'groups.sentEvents')} action={accepted?<ActionButton testID={outings?'group-outings-new':'group-shared-find'} accessibilityLabel={copy(outings?'groups.propose':'groups.findEvent')} icon={<Plus size={18}/>} tone="ghost" onPress={()=>navigation.navigate(outings?'GroupNewOuting':'GroupEventPicker',{groupId})} style={{width:44,paddingHorizontal:0}}/>:undefined}>
  <GroupAccess groupId={groupId} model={model}>{outings?<FlatList testID="group-outings-list" data={plans} keyExtractor={plan=>plan.id} initialNumToRender={12} maxToRenderPerBatch={10} windowSize={7} contentContainerStyle={g.content} ListHeaderComponent={feedback??undefined} ListEmptyComponent={status==='success'?empty:undefined} ListFooterComponent={more?<ActionButton testID="group-outings-more" busy={status==='loading'} title={copy('outings.more')} tone="ghost" onPress={()=>void load(true)}/>:undefined}
   renderItem={({item:plan,index})=>{const event=plan.options.find(option=>option.eventId===plan.chosenEventId),past=['completed','cancelled'].includes(plan.lifecycle??''),previous=plans[index-1],section=!previous||past!==['completed','cancelled'].includes(previous.lifecycle??'');return <View>{section&&<Text style={[g.muted,{paddingBottom:8,paddingTop:index?18:0}]}>{copy(past?'groups.history':'groups.upcoming')}</Text>}<OutingSummary plan={plan} testID={'group-outing-row-'+plan.id} onPress={()=>navigation.navigate('GroupOuting',{groupId,planId:plan.id})}/></View>}}/>:
   <FlatList testID="group-shared-list" data={shared} keyExtractor={message=>message.id} initialNumToRender={12} maxToRenderPerBatch={10} windowSize={7} contentContainerStyle={g.content} ListHeaderComponent={feedback??undefined} ListEmptyComponent={status==='success'?empty:undefined} ListFooterComponent={more?<ActionButton testID="group-shared-more" busy={status==='loading'} title={copy('outings.more')} tone="ghost" onPress={()=>void load(true)}/>:undefined} renderItem={({item:message})=>group?<View style={{gap:6}}><GroupEventReference compact message={message} group={group} actor={model.user?.id} busy={model.busy} store={model.store} onEvent={id=>navigation.navigate('Event',{id})} onOuting={planId=>navigation.navigate('GroupOuting',{groupId,planId})}/><Text style={g.caption}>{copy('groups.sharedBy',{name:message.username})}</Text></View>:null}/>}
  </GroupAccess>
 </GroupPage>;
}
