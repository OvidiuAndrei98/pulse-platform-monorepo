import React,{useEffect,useRef,useState} from 'react';
import { ScrollView,View,useWindowDimensions } from 'react-native';
import { CalendarDays,Check,Search,UsersRound } from 'lucide-react-native';
import { canCreatePlan,planningToday,validPlanningDate } from '@packages/app-core/outings/model';
import { eventCities } from '@packages/app-core/events/constants';
import { usePreferences } from '../usePreferences';
import { FormInput } from '../ui/FormInput';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { DateTimeField } from '../dashboard/DateTimeField';
import { DashboardDropdown } from '../dashboard/DashboardDropdown';
import { MemberAvatar,OutingPressable } from './OutingPrimitives';
import { o } from './outingsStyles';
import type { useOutings } from './useOutings';
export { Choice } from './PlanChoice';

export function PlanBuilder({model,onCreated,onCancel}:{model:ReturnType<typeof useOutings>;onCreated:(id:string)=>void;onCancel:()=>void}) {
  const {copy}=usePreferences(),wide=useWindowDimensions().width>=850,titleRef=useRef<React.ComponentRef<typeof FormInput>>(null);
  const [title,setTitle]=useState(()=>copy('outings.defaultName')),[day,setDay]=useState(planningToday),[city,setCity]=useState('Bucuresti');
  const [friends,setFriends]=useState<string[]>([]),[search,setSearch]=useState(''),[submitted,setSubmitted]=useState(false);
  useEffect(()=>{void model.store.searchEvents();},[model.store]);
  const errors={title:submitted&&!title.trim(),date:submitted&&!validPlanningDate(day),city:submitted&&!eventCities.includes(city),friends:submitted&&(friends.length<1||friends.length>7)};
  const create=async()=>{
    if(model.working)return;setSubmitted(true);
    if(!canCreatePlan(title,day,city,friends)){if(!title.trim())titleRef.current?.focus();return;}
    const result=await model.store.createPlan({title:title.trim(),outingDate:day,city,friendIds:friends});if(result)onCreated(result.id);
  };
  const visible=model.friends.filter(friend=>friend.username.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <View style={o.stack}>
    <View style={{flexDirection:wide?'row':'column',gap:24,alignItems:wide?'flex-start':'stretch'}}>
      <View style={[o.section,{flex:1}]}>
        <View style={o.row}><CalendarDays size={20} color={colors.text}/><Text style={o.heading}>{copy('outings.ui.detailTitle')}</Text></View>
        <View style={{gap:8}}><Text style={o.label}>{copy('outings.planName')}</Text><FormInput ref={titleRef} testID="outing-title" value={title} onChangeText={setTitle} maxLength={80} accessibilityLabel={copy('outings.planName')} invalid={errors.title} editable={!model.working}/>{errors.title&&<Text accessibilityRole="alert" style={o.error}>{copy('outings.ui.invalidTitle')}</Text>}</View>
        <DateTimeField dateOnly label={copy('outings.date')} value={day} onChange={setDay} disabled={model.working} error={errors.date?copy('outings.ui.invalidDate'):undefined}/>
        <DashboardDropdown testID="outing-city" label={copy('outings.city')} placeholder={copy('outings.city')} value={city} onChange={setCity} options={eventCities.map(value=>({value,label:value}))} disabled={model.working} error={errors.city?copy('outings.ui.invalidCity'):undefined}/>
        <Text style={o.caption}>{copy('outings.contextHint')}</Text>
      </View>
      <View style={[o.section,wide&&{width:320}]}>
        <View style={o.split}><View style={o.row}><UsersRound size={20} color={colors.text}/><Text style={o.heading}>{copy('outings.ui.friendsTitle')}</Text></View><Text style={o.caption}>{friends.length}/7</Text></View>
        <Text accessibilityRole={errors.friends?'alert':undefined} style={errors.friends?o.error:o.muted}>{copy(errors.friends?'outings.ui.invalidFriends':'outings.ui.friendsHint')}</Text>
        <View><FormInput testID="outing-friend-search" accessibilityLabel={copy('outings.ui.searchFriends')} placeholder={copy('outings.ui.searchFriends')} value={search} onChangeText={setSearch}/></View>
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{maxHeight:340}} contentContainerStyle={{gap:8,padding:3}}>
          {visible.map(friend=>{const checked=friends.includes(friend.id);return <OutingPressable key={friend.id} accessibilityRole="checkbox" accessibilityLabel={friend.username} accessibilityState={{checked}} disabled={model.working||friends.length>=7&&!checked}
            onPress={()=>setFriends(rows=>checked?rows.filter(id=>id!==friend.id):[...rows,friend.id])} style={[o.friend,checked&&{borderColor:colors.accent}]}>
            <MemberAvatar name={friend.username}/><Text style={[o.label,{flex:1,minWidth:0}]}>{friend.username}</Text><View style={{width:20,height:20,borderWidth:1,borderColor:checked?colors.accent:colors.inputBorder,borderRadius:6,alignItems:'center',justifyContent:'center'}}>{checked&&<Check size={15} color={colors.text}/>}</View>
          </OutingPressable>;})}
          {!model.catalogPending&&!visible.length&&<Text style={o.muted}>{copy(model.friends.length?'outings.ui.noFriendResults':'outings.noFriends')}</Text>}
        </ScrollView>
        <Text accessibilityLiveRegion="polite" style={o.caption}>{copy('outings.ui.selected',{count:friends.length})}</Text>
      </View>
    </View>
    <View style={[o.row,{justifyContent:'flex-end',flexWrap:'wrap'}]}><ActionButton title={copy('common.cancel')} tone="secondary" disabled={model.working} onPress={onCancel}/><ActionButton testID="outing-create" title={copy('outings.create')} busy={model.working} onPress={()=>void create()}/></View>
  </View>;
}
