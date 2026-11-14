import React,{useEffect,useState} from 'react';
import {ScrollView,View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {parsePlans,type OutingPlan} from '@packages/app-core/outings/model';
import {accountApi,useAuth} from '../auth/AuthProvider';
import {usePreferences} from '../usePreferences';
import {GroupBack,groupStyles as s} from '../groups/GroupsScreen';
import {ActionButton} from '../ui/ActionButton';
import {Text} from '../ui/Text';
import {Feedback,Loading} from '../ui/common';

/** Historical links remain readable, but cannot recreate the retired planner. */
export function OutingsScreen({planId,eventId,newPlan}:{planId?:string;eventId?:string;newPlan?:boolean}){
 const navigation=useNavigation<any>(),safe=useSafeAreaInsets(),{copy}=usePreferences(),{user}=useAuth('account');
 const [plan,setPlan]=useState<OutingPlan>(),[failed,setFailed]=useState(false),[loading,setLoading]=useState(!!planId);
 useEffect(()=>{
  if(!planId){navigation.replace('Groups',{eventId,new:!!newPlan});return}
  const controller=new AbortController();setLoading(true);setPlan(undefined);setFailed(false);
  void accountApi('/outings/plans/'+planId,{signal:controller.signal}).then(data=>{if(controller.signal.aborted)return;const p=parsePlans([data])[0]!;if(p.groupId)navigation.replace('GroupOuting',{groupId:p.groupId,planId:p.id});else setPlan(p)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort();
 },[planId,eventId,newPlan,user?.id,navigation]);
 return <View style={[s.root,{paddingTop:safe.top}]}><View style={s.header}><GroupBack onPress={()=>navigation.canGoBack()?navigation.goBack():navigation.replace('Groups')}/><Text style={s.title}>{copy('groups.legacyPlans')}</Text></View><ScrollView contentContainerStyle={s.page}>
  {loading?<Loading/>:failed?<Feedback title={copy('feedback.loadFailed')}/>:plan?<><Text style={s.title}>{plan.title}</Text><Text style={s.muted}>{copy('groups.legacyHint')}</Text>{plan.options.map(o=><ActionButton key={o.eventId} title={o.title} tone="secondary" onPress={()=>navigation.navigate('Event',{id:o.eventId})}/>)}</>:null}
  <ActionButton title={copy('groups.title')} tone="secondary" onPress={()=>navigation.replace('Groups')}/>
 </ScrollView></View>
}
