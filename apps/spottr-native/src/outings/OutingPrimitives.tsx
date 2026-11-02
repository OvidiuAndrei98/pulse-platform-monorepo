import React,{useState} from 'react';
import { Platform,View,type PressableProps,type StyleProp,type ViewStyle } from 'react-native';
import { CalendarDays,Check,ChevronRight,LockKeyhole,MapPin,UsersRound } from 'lucide-react-native';
import { outingDate,outingInitials,outingStage } from '@packages/app-core/outings/presentation';
import type { OutingPlan } from '@packages/app-core/outings/model';
import { MotionPressable } from '../ui/MotionPressable';
import { Text } from '../ui/Text';
import { colors,tokens } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { o } from './outingsStyles';

export function OutingPressable({style,onFocus,onBlur,...props}:Omit<PressableProps,'style'>&{style?:StyleProp<ViewStyle>}) {
  const [focused,setFocused]=useState(false);
  return <MotionPressable {...props} accessibilityRole={props.accessibilityRole??'button'}
    onFocus={event=>{setFocused(Platform.OS!=='web'||!!(event.currentTarget as unknown as HTMLElement).matches?.(':focus-visible'));onFocus?.(event);}}
    onBlur={event=>{setFocused(false);onBlur?.(event);}}
    style={[style,props.disabled&&{opacity:.5},Platform.OS==='web'&&focused&&{outlineColor:colors.focus,outlineWidth:2,outlineStyle:'solid',outlineOffset:3}]}/>;
}
export function MemberAvatar({name}:{name:string}) {
  return <View style={o.avatar} accessible={false}><Text style={o.label}>{outingInitials(name)}</Text></View>;
}
export function OutingBadge({label,tone}:{label:string;tone?:'success'|'warning'}) {
  return <View style={[o.pill,tone&&{backgroundColor:tokens.colors[tone==='success'?'successSurface':'warningSurface']}]}>
    <Text style={[o.caption,{color:tone?colors[tone]:colors.text}]}>{label}</Text>
  </View>;
}
export function DateBlock({day}:{day?:string}) {
  const {language}=usePreferences();
  return <View style={o.dateBlock} accessible={false}><Text style={o.dateNumber}>{outingDate(day,language,'day')||'—'}</Text><Text style={o.caption}>{outingDate(day,language,'month')}</Text></View>;
}
export function OutingMeta({plan}:{plan:OutingPlan}) {
  const {language}=usePreferences();
  return <View style={{gap:6}}>
    {plan.outingDate&&<View style={[o.row,{gap:6}]}><CalendarDays size={15} color={colors.muted}/><Text style={[o.muted,{flexShrink:1}]}>{outingDate(plan.outingDate,language)}</Text></View>}
    {plan.city&&<View style={[o.row,{gap:6}]}><MapPin size={15} color={colors.muted}/><Text style={[o.muted,{flexShrink:1}]}>{plan.city}</Text></View>}
  </View>;
}
export function OutingProgress({plan}:{plan:OutingPlan}) {
  const {copy}=usePreferences(),active=outingStage(plan)==='ready'?2:plan.options.length?1:0;
  return <View style={[o.row,{alignItems:'stretch'}]} accessibilityLabel={copy('outings.ui.progress')}>
    {['ideas','voting','ready'].map((step,index)=><View key={step} style={[o.step,index<=active&&{borderTopColor:colors.accent}]}>
      <View style={o.stepNumber}>{index<active?<Check size={14} color={colors.text}/>:<Text style={o.caption}>{index+1}</Text>}</View>
      <Text style={[o.caption,index===active&&{color:colors.text,fontWeight:'600'}]}>{copy('outings.ui.steps.'+step)}</Text>
    </View>)}
  </View>;
}
export function PlanCard({plan,onOpen,disabled}:{plan:OutingPlan;onOpen:()=>void;disabled?:boolean}) {
  const {copy}=usePreferences(),stage=outingStage(plan),chosen=plan.options.find(option=>option.eventId===plan.chosenEventId);
  return <OutingPressable testID={'outing-card-'+plan.id} onPress={onOpen} disabled={disabled} style={o.card}>
    <View style={o.split}><View style={[o.row,{gap:6}]}><LockKeyhole size={13} color={colors.muted}/><Text style={o.caption}>{copy('outings.ui.private')}</Text></View>
      <OutingBadge label={copy('outings.ui.stage.'+stage)} tone={stage==='ready'?'success':stage==='invited'?'warning':undefined}/></View>
    <View style={o.row}><DateBlock day={plan.outingDate}/><View style={{flex:1,minWidth:0,gap:6}}><Text style={o.heading}>{plan.title}</Text><OutingMeta plan={plan}/></View></View>
    {chosen&&<Text style={o.muted}>{chosen.title}</Text>}
    <View style={o.cardBottom}>
      {plan.status==='accepted'?<View style={[o.row,{gap:8,flexShrink:1}]}><View style={[o.row,{gap:0}]}>{plan.members.slice(0,3).map((member,index)=><View key={member.userId} style={{marginLeft:index?-8:0}}><MemberAvatar name={member.username}/></View>)}</View><Text style={[o.caption,{flexShrink:1}]}>{copy('outings.ui.people',{count:plan.members.length})}</Text></View>:<Text style={[o.muted,{flexShrink:1}]}>{copy('outings.ui.invitationHint')}</Text>}
      <ChevronRight size={18} color={colors.muted}/>
    </View>
  </OutingPressable>;
}
export function OutingEmpty({title,detail,children}:{title:string;detail:string;children?:React.ReactNode}) {
  return <View style={o.empty}><View style={o.emptyIcon}><UsersRound size={26} color={colors.text}/></View><Text style={o.heading}>{title}</Text><Text style={o.muted}>{detail}</Text>{children}</View>;
}
