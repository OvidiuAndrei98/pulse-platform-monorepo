import React from 'react';
import {StyleSheet,View,type StyleProp,type ViewStyle} from 'react-native';
import {ChevronRight} from 'lucide-react-native';
import {groupMembershipCounts,type FriendGroup} from '@packages/app-core/social/groups';
import {conversationTitle,conversationPreview,groupEventDate,outingTitle,outingContextLabel} from '@packages/app-core/social/groupPresentation';
import type {OutingPlan} from '@packages/app-core/outings/model';
import {outingDate} from '@packages/app-core/outings/presentation';
import {useAuth} from '../auth/AuthProvider';
import {usePreferences} from '../usePreferences';
import {MemberAvatar,OutingPressable} from '../outings/OutingPrimitives';
import {EventImage} from '../ui/common';
import {Text} from '../ui/Text';
import {colors,tokens} from '../ui/theme';
import {groupStyles as g} from './groupStyles';

export function GroupAvatar({group,size=48}:{group:FriendGroup;size?:number}){
 const members=[...group.members.filter(m=>m.status==='accepted'),...group.members.filter(m=>m.status==='pending')].slice(0,2);
 const photo=members.length>1?Math.round(size*.69):size;
 return <View pointerEvents="none" style={{width:size,height:size,flexShrink:0}}>{members.map((member,index)=><View key={member.userId} style={{position:'absolute',left:index?size-photo:0,top:index?size-photo:0,opacity:member.status==='pending'?.55:1}}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId} size={photo}/></View>)}</View>;
}

export function ConversationRow({group,onPress,preview,testID}:{group:FriendGroup;onPress:()=>void;preview?:string;testID?:string}){
 const {copy,language}=usePreferences('copy'),{user}=useAuth('account');
 const title=conversationTitle(group,user?.id),counts=groupMembershipCounts(group);
 const timestamp=group.activityAt&&Date.parse(group.activityAt);
 const time=timestamp?new Intl.DateTimeFormat(language,{...(new Date(timestamp).toDateString()===new Date().toDateString()?{hour:'2-digit' as const,minute:'2-digit' as const}:{day:'numeric' as const,month:'short' as const})}).format(new Date(timestamp)):undefined;
 return <OutingPressable testID={testID??'group-row-'+group.id} accessibilityLabel={title} onPress={onPress} style={s.conversation}>
  <GroupAvatar group={group}/><View style={s.flex}>
   <Text numberOfLines={1} style={[g.body,{fontWeight:'600'}]}>{title}</Text>
   <Text numberOfLines={1} style={[g.muted,group.status==='pending'&&{color:colors.text}]}>{preview??conversationPreview(group,language,copy)}</Text>
   {counts.pending>0&&group.status==='accepted'&&<Text style={g.caption}>{copy('groups.members',{count:counts.accepted})} · {copy('groups.invitedCount',{count:counts.pending})}</Text>}
  </View><View style={s.trailing}>{!!time&&group.status==='accepted'&&<Text style={g.caption}>{time}</Text>}{group.unread>0&&group.status==='accepted'&&<View style={s.unread}><Text style={[g.caption,{color:colors.onAction,fontWeight:'600'}]}>{group.unread>99?'99+':group.unread}</Text></View>}</View>
 </OutingPressable>;
}

type EventPreviewProps={title:string;startTime?:string;imageUrl?:string;location?:string;city?:string;variant?:'compact'|'media';onPress?:()=>void;disabled?:boolean;testID?:string;trailing?:React.ReactNode;children?:React.ReactNode;style?:StyleProp<ViewStyle>};
export function EventPreview({title,startTime,imageUrl,location,city,variant='compact',onPress,disabled,testID,trailing,children,style}:EventPreviewProps){
 const {language}=usePreferences('copy'),media=variant==='media';
 const place=[location,city&&city!==location?city:undefined].filter(Boolean).join(' · ');
 const details=<><EventImage uri={imageUrl} style={media?s.poster:s.thumbnail}/><View style={[s.flex,media&&s.mediaCopy]}><Text style={g.heading} numberOfLines={media?undefined:2}>{title}</Text>{!!startTime&&<Text style={g.muted}>{groupEventDate(startTime,language)}</Text>}{!!place&&<Text style={g.muted} numberOfLines={media?undefined:2}>{place}</Text>}{!media&&children}</View>{trailing}</>;
 const bodyStyle=media?s.mediaBody:s.eventRow;
 return <View testID={testID} style={[media?s.mediaCard:s.compactCard,style]}>{onPress?<OutingPressable accessibilityLabel={title} disabled={disabled} onPress={onPress} style={bodyStyle}>{details}</OutingPressable>:<View style={bodyStyle}>{details}</View>}{media&&children&&<View style={s.mediaFooter}>{children}</View>}</View>;
}

export function OutingSummary({plan,onPress,testID,compact=false}:{plan:OutingPlan;onPress:()=>void;testID?:string;compact?:boolean}){
 const {copy,language}=usePreferences('copy'),event=plan.options.find(o=>o.eventId===plan.chosenEventId);
 const state=plan.lifecycle==='cancelled'?'groups.cancelled':plan.lifecycle==='completed'?'groups.completed':event?'groups.chosen':plan.options.length?'groups.suggestionsCount':'groups.noEventChosen';
 return <OutingPressable testID={testID} accessibilityLabel={outingTitle(plan,language)} onPress={onPress} style={[s.summary,compact&&{paddingVertical:4}]}>
  {event?<EventImage uri={event.imageUrl} style={{width:48,height:56,borderRadius:tokens.radius.field}}/>:<View style={s.date}><Text style={[g.heading,{fontSize:24,lineHeight:28}]}>{outingDate(plan.outingDate,language,'day')||'—'}</Text><Text style={g.caption}>{outingDate(plan.outingDate,language,'month')}</Text></View>}
  <View style={s.flex}><Text numberOfLines={2} style={[g.body,{fontWeight:'600'}]}>{outingTitle(plan,language)}</Text><Text style={g.muted}>{outingContextLabel(plan,language)}</Text><Text style={g.caption}>{copy(state,{count:plan.options.length})}</Text></View><ChevronRight size={18} color={colors.muted}/>
 </OutingPressable>;
}

export function MessageMeta({time,mine=false,testID}:{time:string;mine?:boolean;testID?:string}){
 return <Text testID={testID} style={[g.caption,{alignSelf:mine?'flex-end':'flex-start',marginHorizontal:4,marginTop:4}]}>{time}</Text>;
}

const s=StyleSheet.create({
 flex:{flex:1,minWidth:0,gap:4},conversation:{flexDirection:'row',alignItems:'center',gap:tokens.spacing.md,paddingVertical:tokens.spacing.md,minHeight:80},trailing:{alignSelf:'flex-start',alignItems:'flex-end',gap:8,paddingTop:4},unread:{minWidth:22,minHeight:22,borderRadius:11,backgroundColor:colors.action,alignItems:'center',justifyContent:'center',paddingHorizontal:6},
 compactCard:{width:'100%'},eventRow:{flexDirection:'row',alignItems:'center',gap:tokens.spacing.md,paddingVertical:tokens.spacing.sm},thumbnail:{width:88,height:108,borderRadius:tokens.radius.field},
 mediaCard:{backgroundColor:colors.surface,borderRadius:tokens.radius.surface,overflow:'hidden',width:'100%'},mediaBody:{width:'100%'},poster:{width:'100%',aspectRatio:1.7},mediaCopy:{padding:tokens.spacing.lg,gap:6},mediaFooter:{paddingHorizontal:tokens.spacing.lg,paddingBottom:tokens.spacing.md},
 summary:{flexDirection:'row',gap:tokens.spacing.md,alignItems:'center',paddingVertical:tokens.spacing.md},date:{width:48,minHeight:56,alignItems:'center',justifyContent:'center',gap:2},
});
