import React from 'react';
import {StyleSheet,View,type StyleProp,type ViewStyle} from 'react-native';
import {ChevronRight} from 'lucide-react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {groupMembershipCounts,type FriendGroup} from '@packages/app-core/social/groups';
import {conversationTitle,conversationPreview,groupEventDate,groupNightDate,outingTitle,outingContextLabel,pinnedOutingPresentation} from '@packages/app-core/social/groupPresentation';
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
  </View><View style={s.trailing}>{!!time&&group.status==='accepted'&&<Text style={g.caption}>{time}</Text>}{group.unread>0&&group.status==='accepted'&&<View style={s.unread}><Text style={[g.caption,{color:colors.onAction,fontWeight:'600'}]}>{group.unread>99?'99+':group.unread}</Text></View>}</View>
 </OutingPressable>;
}

type EventPreviewProps={title:string;startTime?:string;imageUrl?:string;location?:string;city?:string;variant?:'compact'|'media'|'detail'|'message';onPress?:()=>void;disabled?:boolean;testID?:string;trailing?:React.ReactNode;children?:React.ReactNode;style?:StyleProp<ViewStyle>};
export function EventPreview({title,startTime,imageUrl,location,city,variant='compact',onPress,disabled,testID,trailing,children,style}:EventPreviewProps){
 const {language}=usePreferences('copy'),media=variant==='media'||variant==='detail',message=variant==='message';
 const place=[location,city&&city!==location?city:undefined].filter(Boolean).join(' · ');
 if(variant==='media'){
  const preview=<View testID={(testID??'group-event-preview')+'-cover'} style={s.invitationCover}>
   <EventImage uri={imageUrl} fallback="neutral" fadeIn={false} style={StyleSheet.absoluteFill}/>
   <View testID={(testID??'group-event-preview')+'-body'} style={s.invitationCopy}>
    <LinearGradient pointerEvents="none" colors={['#00000000','#000000b3','#000000db']} locations={[0,.35,1]} style={StyleSheet.absoluteFill}/>
    {!!startTime&&<Text style={s.invitationDate}>{groupEventDate(startTime,language)}</Text>}
    <Text style={s.invitationTitle}>{title}</Text>
    {!!place&&<Text style={s.invitationPlace}>{place}</Text>}
   </View>
  </View>;
  return <View testID={testID} style={[s.mediaCard,style]}>{onPress?<OutingPressable accessibilityLabel={title} disabled={disabled} onPress={onPress} style={{width:'100%'}}>{preview}</OutingPressable>:preview}{!!children&&<View testID={(testID??'group-event-preview')+'-actions'} style={s.coverActions}>{children}</View>}</View>;
 }
 if(media){
  const preview=<><View testID={(testID??'group-event-preview')+'-cover'} style={[s.cover,variant==='detail'&&{aspectRatio:2.1}]}><EventImage uri={imageUrl} fallback="neutral" fadeIn={false} style={StyleSheet.absoluteFill}/>{!!startTime&&<LinearGradient pointerEvents="none" colors={['transparent','#000000b3']} locations={[.4,1]} style={StyleSheet.absoluteFill}/>}{!!startTime&&<Text style={s.coverDate}>{groupEventDate(startTime,language)}</Text>}</View><View testID={(testID??'group-event-preview')+'-body'} style={s.coverCopy}><Text style={s.coverTitle} numberOfLines={2}>{title}</Text>{!!place&&<Text style={s.messageMeta} numberOfLines={1}>{place}</Text>}</View></>;
  return <View testID={testID} style={[s.mediaCard,style]}>{onPress?<OutingPressable accessibilityLabel={title} disabled={disabled} onPress={onPress} style={{width:'100%'}}>{preview}</OutingPressable>:preview}{!!children&&<View testID={(testID??'group-event-preview')+'-actions'} style={s.coverActions}>{children}</View>}</View>;
 }
 const details=<><EventImage uri={imageUrl} fallback="neutral" style={message?s.messageThumbnail:s.thumbnail}/><View style={s.flex}><Text style={message?s.messageTitle:g.heading} numberOfLines={2}>{title}</Text>{!!startTime&&<Text style={message?s.messageMeta:g.muted}>{groupEventDate(startTime,language)}</Text>}{!!place&&<Text style={message?s.messageMeta:g.muted} numberOfLines={2}>{place}</Text>}{children}</View>{trailing}</>;
 const bodyStyle=[s.eventRow,message&&{paddingVertical:0}];
 return <View testID={testID} style={[s.compactCard,style]}>{onPress?<OutingPressable accessibilityLabel={title} disabled={disabled} onPress={onPress} style={bodyStyle}>{details}</OutingPressable>:<View style={bodyStyle}>{details}</View>}</View>;
}

export function OutingSummary({plan,onPress,testID,compact=false,otherCount=0}:{plan:OutingPlan;onPress:()=>void;testID?:string;compact?:boolean;otherCount?:number}){
 const {copy,language}=usePreferences('copy'),event=plan.options.find(o=>o.eventId===plan.chosenEventId);
 const state=plan.lifecycle==='cancelled'?'groups.cancelled':plan.lifecycle==='completed'?'groups.completed':event?'groups.chosen':plan.options.length?'groups.suggestionsCount':'groups.noEventChosen';
 if(compact){const pinned=pinnedOutingPresentation([plan],language,copy);return <OutingPressable testID={testID} accessibilityLabel={pinned?.title??outingTitle(plan,language)} onPress={onPress} style={[s.summary,{minHeight:52,paddingVertical:6}]}>
  {event&&<EventImage uri={event.imageUrl} style={{width:34,height:38,borderRadius:8}}/>}<View style={s.flex}><Text numberOfLines={1} style={[g.muted,{color:colors.text,fontWeight:'600'}]}>{pinned?.title??outingTitle(plan,language)}</Text><Text numberOfLines={1} style={g.caption}>{pinned?.subtitle??plan.city}{otherCount>0?' · '+copy('groups.moreOutings',{count:otherCount}):''}</Text></View><ChevronRight size={17} color={colors.muted}/>
 </OutingPressable>;
 }
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
 messageThumbnail:{width:72,height:88,borderRadius:tokens.radius.field},messageTitle:{fontSize:16,lineHeight:21,fontWeight:'600',color:colors.text},messageMeta:{fontSize:13,lineHeight:18,color:colors.muted},
 mediaCard:{backgroundColor:colors.surface,borderRadius:tokens.radius.surface,overflow:'hidden',width:'100%'},
 invitationCover:{width:'100%',minHeight:156,position:'relative',justifyContent:'flex-end',overflow:'hidden',backgroundColor:colors.raised},invitationCopy:{paddingHorizontal:12,paddingTop:48,paddingBottom:12,gap:3},invitationDate:{fontSize:12,lineHeight:18,color:'#ffffffd9'},invitationTitle:{fontSize:18,lineHeight:24,fontWeight:'700',color:'#ffffff'},invitationPlace:{fontSize:12,lineHeight:18,color:'#ffffffd9'},
 cover:{width:'100%',aspectRatio:2.4,position:'relative',backgroundColor:colors.raised,overflow:'hidden'},coverDate:{position:'absolute',bottom:10,left:12,right:12,fontSize:13,lineHeight:18,fontWeight:'600',color:'#fff'},coverCopy:{padding:12,gap:4},coverTitle:{fontSize:17,lineHeight:23,fontWeight:'600',color:colors.text},coverActions:{paddingHorizontal:12,paddingTop:2,paddingBottom:4,gap:6},
 summary:{flexDirection:'row',gap:tokens.spacing.md,alignItems:'center',paddingVertical:tokens.spacing.md},date:{width:48,minHeight:56,alignItems:'center',justifyContent:'center',gap:2},
});
