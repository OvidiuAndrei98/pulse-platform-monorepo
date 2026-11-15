import React,{useEffect,useState} from 'react';
import {FlatList,StyleSheet,View} from 'react-native';
import {Check,Plus} from 'lucide-react-native';
import {groupCatalogKey} from '@packages/app-core/social/groups';
import {matchesPlanningContext,type OutingPlan} from '@packages/app-core/outings/model';
import {outingDate} from '@packages/app-core/outings/presentation';
import {useGroups} from './useGroups';
import {EventPreview} from './GroupContent';
import {groupStyles as s} from './groupStyles';
import {GroupSearchField} from './GroupGlassControls';
import {usePreferences} from '../usePreferences';
import {Text} from '../ui/Text';
import {ActionButton} from '../ui/ActionButton';
import {EventImage,Loading} from '../ui/common';
import {OutingPressable} from '../outings/OutingPrimitives';
import {formatDate} from '../data/events';
import {colors} from '../ui/theme';

export function EventChooser({model,onSelect,plan,context:override,onEdit}:{model:ReturnType<typeof useGroups>;onSelect:(id:string)=>void;plan?:OutingPlan;context?:{date?:string;city?:string};onEdit?:()=>void}){
 const {copy,language}=usePreferences(),[q,setQ]=useState(''),[page,setPage]=useState(1),[debouncing,setDebouncing]=useState(true);
 const context=override??(plan?{date:plan.outingDate,city:plan.city}:undefined),key=groupCatalogKey(q,context),current=model.catalogKey===key;
 useEffect(()=>{setDebouncing(true);const request=()=>{setPage(1);setDebouncing(false);void model.store.catalog(q,context)};if(!q.trim()){request();return}const timer=setTimeout(request,220);return()=>clearTimeout(timer)},[q,plan?.id,context?.date,context?.city,model.store]);
 const loading=debouncing||!current||model.catalogStatus==='idle'||model.catalogLoading&&page===1,failed=current&&model.catalogStatus==='error';
 const events=current?model.events.filter(event=>!context||matchesPlanningContext(event,{outingDate:context.date,city:context.city})):[];
 const retry=()=>{setPage(1);void model.store.catalog(q,context)};
 const empty=loading?<Loading/>:failed?<View testID="group-picker-error" style={{gap:12,paddingVertical:12}}><Text style={s.body}>{copy(model.catalogError??'groups.eventPickerError')}</Text><ActionButton testID="group-picker-retry" title={copy('groups.retryLoading')} tone="secondary" onPress={retry}/></View>:<View testID="group-picker-empty" style={{gap:14,paddingVertical:14}}><Text style={s.body}>{copy(q.trim()?'groups.emptySearchResults':context?'groups.eventPickerEmpty':'groups.eventPickerEmptyGeneral',{city:context?.city??''})}</Text>{!!q.trim()&&<ActionButton title={copy('groups.clearSearch')} tone="secondary" onPress={()=>setQ('')}/>}</View>;
 return <View testID="group-event-picker" style={{flex:1}}>
  <View style={{padding:20,gap:12,width:'100%',maxWidth:760,alignSelf:'center'}}>{context&&<View testID="group-event-picker-context" style={{flexDirection:'row',gap:12,alignItems:'flex-start'}}><View style={{flex:1,gap:4}}><Text style={s.heading}>{outingDate(context.date,language)}</Text><Text style={s.muted}>{context.city}</Text></View>{onEdit&&<ActionButton testID="group-picker-edit-context" title={copy('groups.change')} tone="ghost" size="compact" onPress={onEdit} style={{paddingHorizontal:4}}/>}</View>}<GroupSearchField label={copy('groups.search')} value={q} onChangeText={setQ}/></View>
  <FlatList testID="group-picker-results" data={loading||failed?[]:events} keyExtractor={event=>event.id} initialNumToRender={10} maxToRenderPerBatch={8} windowSize={7} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{paddingHorizontal:20,paddingBottom:32,gap:12,width:'100%',maxWidth:760,alignSelf:'center'}} ListEmptyComponent={empty} ListFooterComponent={current&&model.catalogMore&&!failed?<ActionButton title={copy('outings.more')} tone="ghost" busy={model.catalogLoading} onPress={()=>{setPage(page+1);void model.store.catalog(q,context,page+1)}}/>:undefined} renderItem={({item:event})=>{const added=plan?.options.some(o=>o.eventId===event.id);return <EventPreview testID={'group-send-event-'+event.id} title={event.title} startTime={event.startTime} imageUrl={event.bannerUrl} location={event.locationName} city={event.city} disabled={added||model.busy||!!plan&&plan.options.length>=8} onPress={()=>onSelect(event.id)} trailing={added?<Check size={20} color={colors.accent}/>:<Plus size={20} color={colors.accent}/>}>{added&&<Text style={s.caption}>{copy('groups.added')}</Text>}</EventPreview>}}/>
 </View>;
}

