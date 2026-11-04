import React,{useEffect,useState} from 'react';
import { AccessibilityInfo,ActivityIndicator,View,useWindowDimensions } from 'react-native';
import { ArrowLeft,LockKeyhole,Plus } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isOutingId } from '@packages/app-core/outings/model';
import { useOutings } from './useOutings';
import { PlanBuilder } from './PlanBuilder';
import { PlanDetails } from './PlanDetails';
import { EventOutingStart } from './EventOutingStart';
import { OutingEmpty,PlanCard } from './OutingPrimitives';
import { FormScrollView } from '../ui/KeyboardForms';
import { OutingAction as ActionButton } from './OutingPrimitives';
import { GlassPressable } from '../ui/GlassPressable';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { useAuth } from '../auth/AuthProvider';
import { o } from './outingsStyles';

export function OutingsScreen({planId,eventId,newPlan}:{planId?:string;eventId?:string;newPlan?:boolean}) {
  const {user}=useAuth('account');return <OutingsContent key={user?.id??'guest'} planId={planId} eventId={eventId} newPlan={newPlan}/>;
}
function OutingsContent({planId,eventId,newPlan}:{planId?:string;eventId?:string;newPlan?:boolean}) {
  const model=useOutings(),{copy}=usePreferences(),navigation=useNavigation<any>(),safe=useSafeAreaInsets(),wide=useWindowDimensions().width>=850;
  const [selected,setSelected]=useState(isOutingId(planId)?planId:''),[building,setBuilding]=useState(!!newPlan&&!isOutingId(eventId));
  useEffect(()=>{if(selected&&!model.pending)void model.store.loadPlan(selected);},[selected,model.pending,model.store]);
  useEffect(()=>{if(model.notice)AccessibilityInfo.announceForAccessibility(copy(model.notice));},[model.notice,copy]);
  const plan=model.plans.find(item=>item.id===selected),invitations=model.plans.filter(item=>item.status==='pending'),mine=model.plans.filter(item=>item.status==='accepted');
  const eventOrigin=isOutingId(eventId)&&!selected&&!building;
  const leaveEvent=()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Tabs',{screen:'Feed'});
  const back=()=>{if(eventOrigin)leaveEvent();else if(building)setBuilding(false);else if(selected)setSelected('');else if(navigation.canGoBack())navigation.goBack();else navigation.navigate('Tabs',{screen:'Friends'});};
  const create=<ActionButton testID="outing-new" title={copy('outings.newPlan')} icon={<Plus size={18}/>} onPress={()=>setBuilding(true)}/>;
  const cards=(rows:typeof model.plans,label:string)=><View style={{gap:16}}>
    <View style={o.split}><Text style={o.heading}>{label}</Text><Text style={o.caption}>{rows.length}</Text></View>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:16}}>{rows.map(item=><View key={item.id} style={{flexBasis:wide?'47%':'100%',flexGrow:1,minWidth:0}}><PlanCard plan={item} onOpen={()=>setSelected(item.id)} disabled={model.working}/></View>)}</View>
  </View>;
  return <View testID="outings-screen" style={{flex:1,backgroundColor:colors.bg,paddingTop:safe.top}}>
    <FormScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:20,paddingBottom:safe.bottom+48,gap:24,maxWidth:800,width:'100%',alignSelf:'center'}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:12,minHeight:48}}>
        <GlassPressable accessibilityRole="button" accessibilityLabel={copy('common.back')} disabled={model.working} onPress={back} style={{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center',backgroundColor:colors.raised}}><ArrowLeft size={20} color={colors.text}/></GlassPressable>
        <Text accessibilityRole={!plan?'header':undefined} style={{flex:1,color:colors.text,fontSize:building||plan||eventOrigin?16:24,lineHeight:building||plan||eventOrigin?23:29,fontWeight:'700',letterSpacing:building||plan||eventOrigin?-.2:-.6}}>{copy(building||eventOrigin?'outings.newPlan':'outings.title')}</Text>
        {!building&&!plan&&!eventOrigin&&model.user&&model.plans.length>0&&<ActionButton testID="outing-new" accessibilityLabel={copy('outings.newPlan')} icon={<Plus size={20}/>} style={{width:44,paddingHorizontal:0}} onPress={()=>setBuilding(true)}/>}
      </View>
      {model.error&&<View style={o.notice}><View style={{flex:1,gap:12}}><Text accessibilityRole="alert" style={o.error}>{copy(model.error)}</Text><ActionButton title={copy('common.retry')} tone="secondary" onPress={()=>void model.store.load()}/></View></View>}
      {!model.ready||model.user&&model.pending?<ActivityIndicator accessibilityLabel={copy('common.loading')} color={colors.accent}/>:
        !model.user?<OutingEmpty title={copy('outings.ui.emptyTitle')} detail={copy('outings.ui.emptyHint')}><ActionButton title={copy('nav.profile')} onPress={()=>navigation.navigate('Auth',{returnOutings:true,returnOutingsEvent:isOutingId(eventId)?eventId:undefined})}/></OutingEmpty>:
        model.error&&!model.plans.length&&!building&&!selected&&!eventOrigin?null:eventOrigin?<EventOutingStart eventId={eventId!} model={model} onOpen={setSelected} onCancel={leaveEvent}/>:building?<PlanBuilder model={model} onCancel={()=>setBuilding(false)} onCreated={id=>{setBuilding(false);setSelected(id);}}/>:
        plan?<PlanDetails key={plan.id} plan={plan} model={model} onEvent={id=>navigation.navigate('Event',{id})} onNight={eventId=>navigation.navigate('EventNight',{eventId})} onGroup={eventId=>navigation.navigate('SafetyGroup',{eventId})}/>:
        <>
          {invitations.length>0&&cards(invitations,copy('outings.ui.invitations'))}
          {mine.length>0&&cards(mine,copy('outings.ui.yourOutings'))}
          {!model.plans.length&&<OutingEmpty title={copy('outings.ui.emptyTitle')} detail={copy('outings.ui.emptyHint')}>{create}</OutingEmpty>}
        </>}
    </FormScrollView>
  </View>;
}
