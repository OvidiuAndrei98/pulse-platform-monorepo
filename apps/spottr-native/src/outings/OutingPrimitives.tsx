import React,{useState} from 'react';
import { Platform,View,type PressableProps,type StyleProp,type ViewStyle } from 'react-native';
import { CalendarDays,Check,ChevronRight,LockKeyhole,MapPin,UsersRound } from 'lucide-react-native';
import { outingDate,outingInitials,outingStage,responseCount } from '@packages/app-core/outings/presentation';
import type { OutingPlan } from '@packages/app-core/outings/model';
import { MotionPressable } from '../ui/MotionPressable';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors,tokens } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { o } from './outingsStyles';
import { j } from './journeyStyles';
import { GlassSurface,supportsLiquidGlass } from '../ui/GlassSurface';
import { SocialPhoto } from '../social/components';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import { accountApi,useAuth } from '../auth/AuthProvider';
import { profilesApi,publicProfileKey } from '../profiles/usePublicProfile';
import { isOutingId } from '@packages/app-core/outings/model';
import { parseFriends,type Friend } from '../social/data';

/** Quiet filled actions for the planner; other app surfaces keep their own styling. */
export function OutingAction({style,...props}:React.ComponentProps<typeof ActionButton>) {
 return <ActionButton {...props} style={state=>[{borderWidth:0},typeof style==='function'?style(state):style]}/>;
}

export function OutingPressable({style,onFocus,onBlur,...props}:Omit<PressableProps,'style'>&{style?:StyleProp<ViewStyle>}) {
  const [focused,setFocused]=useState(false);
  return <MotionPressable {...props} accessibilityRole={props.accessibilityRole??'button'}
    onFocus={event=>{setFocused(Platform.OS!=='web'||!!(event.currentTarget as unknown as HTMLElement).matches?.(':focus-visible'));onFocus?.(event);}}
    onBlur={event=>{setFocused(false);onBlur?.(event);}}
    style={[style,props.disabled&&{opacity:.5},Platform.OS==='web'&&focused&&{outlineColor:colors.focus,outlineWidth:2,outlineStyle:'solid',outlineOffset:3}]}/>;
}
function MemberAvatarActivity({id,owner,missing}:{id?:string;owner?:string;missing:boolean}) {
 const focused=useIsFocused();
 useQuery({queryKey:publicProfileKey(id??'',owner),queryFn:({signal})=>profilesApi.profile(id!,signal),enabled:focused&&!!owner&&!!id&&missing,staleTime:60_000,retry:false});
 return null;
}
export function MemberAvatar({name,uri,userId,size=36}:{name:string;uri?:string;userId?:string;size?:number}) {
 const {user}=useAuth('account'),id=isOutingId(userId)?userId.toLowerCase():undefined;
 const friends=useQuery<Friend[]>({queryKey:['friends',user?.id],queryFn:async({signal})=>parseFriends(await accountApi('/friends',{signal})),enabled:false});
 const known=uri?.trim()||(id===user?.id?user?.avatarUrl:undefined)||friends.data?.find(friend=>friend.id===id)?.avatarUrl;
 // Older plan responses omit avatarUrl. Reuse the account-scoped public-profile
 // cache instead of leaving a known member permanently at their initials.
 const profile=useQuery({queryKey:publicProfileKey(id??'',user?.id),queryFn:({signal})=>profilesApi.profile(id!,signal),enabled:false,staleTime:60_000,retry:false});
 const source=known||profile.data?.avatarUrl;
 const photo=<SocialPhoto uri={source} initial={name} initialSize={size<30?10:13} style={{width:size-2,height:size-2,borderRadius:(size-2)/2}}/>;
 return <><MemberAvatarActivity id={id} owner={user?.id} missing={!known}/>{supportsLiquidGlass?<GlassSurface testID="outing-member-photo" interactive={false} pointerEvents="none" style={{width:size,height:size,borderRadius:size/2,alignItems:'center',justifyContent:'center'}}>{photo}</GlassSurface>:<View testID="outing-member-photo" style={{width:size,height:size,borderRadius:size/2,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface}} accessible={false}>{photo}</View>}</>;
}
export function OutingBadge({label,tone}:{label:string;tone?:'success'|'warning'}) {
  return <View style={[o.pill,tone&&{backgroundColor:tokens.colors[tone==='success'?'successSurface':'warningSurface']}]}>
    <Text style={[o.caption,{color:tone?colors[tone]:colors.text}]}>{label}</Text>
  </View>;
}
export function DateBlock({day}:{day?:string}) {
  const {language}=usePreferences();
  return <View style={j.dateBlock} accessible={false}><Text style={j.dateNumber}>{outingDate(day,language,'day')||'—'}</Text><Text style={j.dateMonth}>{outingDate(day,language,'month')}</Text></View>;
}
export function OutingMeta({plan}:{plan:OutingPlan}) {
  const {language}=usePreferences();
  return <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
    {plan.outingDate&&<View style={[o.row,{gap:6}]}><CalendarDays size={15} color={colors.muted}/><Text style={[o.muted,{flexShrink:1}]}>{outingDate(plan.outingDate,language)}</Text></View>}
    {plan.city&&<View style={[o.row,{gap:6}]}><MapPin size={15} color={colors.muted}/><Text style={[o.muted,{flexShrink:1}]}>{plan.city}</Text></View>}
  </View>;
}
export function OutingProgress({plan}:{plan:OutingPlan}) {
 const {copy}=usePreferences(),active=plan.chosenEventId?2:plan.outingDate?1:0;
 return <View style={{gap:8}} accessibilityLabel={copy('outings.ui.progress')}><View style={{flexDirection:'row',gap:4}}>{[0,1,2].map(index=><View key={index} style={{flex:1,height:3,borderRadius:2,backgroundColor:index<=active?colors.accent:colors.raised}}/>)}</View><View style={{flexDirection:'row',gap:8}}>{['stepNight','stepEvent','stepReady'].map((step,index)=><Text key={step} style={[o.caption,{flex:1,fontSize:11,color:index===active?colors.text:colors.muted,textAlign:index===0?'left':index===2?'right':'center'}]}>{copy('outings.plan.'+step)}</Text>)}</View></View>;
}
export function PlanCard({plan,onOpen,disabled}:{plan:OutingPlan;onOpen:()=>void;disabled?:boolean}) {
 const {copy,language}=usePreferences('copy'),stage=outingStage(plan),members=plan.members.filter(m=>m.status==='accepted'),answered=responseCount(plan),chosen=plan.options.find(option=>option.eventId===plan.chosenEventId);
 const status=stage==='invited'?'invited':stage==='ready'?'statusReady':stage==='voting'?'statusVoting':'statusDates';
 return <OutingPressable testID={'outing-card-'+plan.id} onPress={onOpen} disabled={disabled} style={{padding:16,gap:16,borderRadius:24,backgroundColor:colors.raised,flexDirection:'row',alignItems:'center',minWidth:0,minHeight:112}}>
  <View style={{width:50,alignItems:'center',gap:2}}>{plan.outingDate?<><Text style={j.dateNumber}>{outingDate(plan.outingDate,language,'day')}</Text><Text style={j.dateMonth}>{outingDate(plan.outingDate,language,'month')}</Text></>:<CalendarDays size={30} color={colors.muted}/>}</View>
  <View style={{flex:1,minWidth:0,gap:5}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:5}}><View style={{width:5,height:5,borderRadius:3,backgroundColor:stage==='ready'?colors.success:colors.accent}}/><Text style={[o.caption,{fontSize:11,color:stage==='ready'?colors.success:colors.muted}]}>{copy('outings.plan.'+status)}</Text></View>
   <Text numberOfLines={2} style={[o.heading,{fontSize:17,lineHeight:22}]}>{plan.title}</Text>
   <Text numberOfLines={1} style={o.caption}>{plan.city}{chosen?' · '+chosen.title:''}</Text>
   {plan.status==='accepted'&&<View style={{flexDirection:'row',alignItems:'center',gap:9,marginTop:3}}><View style={{flexDirection:'row'}}>{members.slice(0,3).map((m,i)=><View key={m.userId} style={{marginLeft:i?-8:0}}><MemberAvatar name={m.username} userId={m.userId} uri={m.avatarUrl} size={24}/></View>)}</View><Text style={[o.caption,{fontSize:11}]}>{stage==='ready'?copy('outings.ui.people',{count:members.length}):copy('outings.plan.replies',{answered,total:members.length})}</Text></View>}
  </View><View style={{width:28,height:28,borderRadius:14,backgroundColor:'#ffffff08',alignItems:'center',justifyContent:'center'}}><ChevronRight size={15} color={colors.muted}/></View>
 </OutingPressable>;
}
export function OutingEmpty({title,detail,children}:{title:string;detail:string;children?:React.ReactNode}) {
  return <View style={[o.empty,{borderWidth:0,backgroundColor:'transparent',alignItems:'center',paddingVertical:40}]}><View style={[o.emptyIcon,{borderRadius:28,backgroundColor:colors.raised}]}><UsersRound size={26} color={colors.text}/></View><Text style={[o.heading,{fontSize:22,textAlign:'center'}]}>{title}</Text><Text style={[o.muted,{maxWidth:340,textAlign:'center'}]}>{detail}</Text>{children}</View>;
}
