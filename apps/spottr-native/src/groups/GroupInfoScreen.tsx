import React,{useEffect,useRef,useState} from 'react';
import {ScrollView,Switch,View} from 'react-native';
import {useIsFocused,useNavigation} from '@react-navigation/native';
import {Bell,CalendarDays,Check,Images,LogOut,Pencil,UserPlus} from 'lucide-react-native';
import {GROUP_MEMBER_LIMIT,groupMembershipCounts,type FriendGroup} from '@packages/app-core/social/groups';
import {GroupAvatar} from './GroupContent';
import {conversationTitle} from '@packages/app-core/social/groupPresentation';
import {GroupAccess,GroupPage,GroupSettingRow,g} from './GroupPage';
import {GroupActionSheet} from './GroupActionSheet';
import {GroupSearchField} from './GroupGlassControls';
import {useGroups} from './useGroups';
import {usePreferences} from '../usePreferences';
import {MemberAvatar,OutingPressable} from '../outings/OutingPrimitives';
import {ActionButton} from '../ui/ActionButton';
import {FormInput} from '../ui/FormInput';
import {Text} from '../ui/Text';
import {Feedback,Loading} from '../ui/common';
import {colors} from '../ui/theme';

type Panel={kind:'rename'|'invite'|'leave'|'remove'|'transfer';userId?:string};
export function GroupInfoScreen({groupId}:{groupId:string}){
 const model=useGroups(groupId),{copy}=usePreferences(),navigation=useNavigation<any>(),focused=useIsFocused();
 const group=model.groups.find(group=>group.id===groupId),owner=group?.ownerId===model.user?.id;
 const [panel,setPanel]=useState<Panel|null>(null),[closing,setClosing]=useState(false),[muteError,setMuteError]=useState<string|null>(null);
 const alive=useRef(true),dialogGeneration=useRef(0),isClosing=useRef(false),isFocused=useRef(focused);isFocused.current=focused;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;dialogGeneration.current++}},[groupId,model.user?.id]);
 const open=(value:Panel)=>{dialogGeneration.current++;isClosing.current=false;setClosing(false);setPanel(value)};
 const close=()=>{isClosing.current=true;setClosing(true)};
 const dismissed=()=>{dialogGeneration.current++;isClosing.current=false;setPanel(null);setClosing(false)};
 // Successful leave revokes the private group and unmounts its action sheet.
 // The page, not that child, owns the acknowledgement and final navigation.
 const leave=async()=>{
  const generation=dialogGeneration.current;
  const ok=await model.store.action(groupId,{action:'leave'});
  if(ok&&alive.current&&isFocused.current&&!isClosing.current&&generation===dialogGeneration.current)navigation.navigate('Groups');
  return ok;
 };
 const counts=group?groupMembershipCounts(group):{accepted:0,pending:0};
 const others=group?.members.filter(member=>member.userId!==model.user?.id&&member.status==='accepted')??[];
 return <GroupPage groupId={groupId} title={copy('groups.info')} testID="group-info">
  <GroupAccess model={model} groupId={groupId}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[g.content,{paddingBottom:40}]}>
   {group&&<>
    <View style={{gap:16,paddingVertical:12}}><GroupAvatar group={group} size={64}/><View style={{gap:7}}><Text testID="group-info-name" numberOfLines={group.name.trim()?undefined:3} accessibilityLabel={conversationTitle(group,model.user?.id,true)} style={[g.title,{fontSize:26,lineHeight:33}]}>{conversationTitle(group,model.user?.id,true)}</Text><Text style={g.muted}>{copy('groups.members',{count:counts.accepted})}{counts.pending?' · '+copy('groups.invitedCount',{count:counts.pending}):''}</Text></View>{owner&&<OutingPressable testID="group-info-rename" onPress={()=>open({kind:'rename'})} style={[g.row,{minHeight:44,alignSelf:'flex-start',gap:8}]}><Pencil size={16} color={colors.muted}/><Text style={g.body}>{copy('groups.rename')}</Text></OutingPressable>}</View>
    <View style={g.section}>
     <GroupSettingRow testID="group-info-outings" title={copy('groups.outings')} subtitle={copy('groups.upcoming')+' · '+String(group.outings.filter(p=>!['completed','cancelled'].includes(p.lifecycle??'')).length)} icon={CalendarDays} onPress={()=>navigation.navigate('GroupOutings',{groupId})}/>
     <GroupSettingRow testID="group-info-shared" title={copy('groups.sentEvents')} subtitle={model.collectionStatus[groupId]==='success'?String(new Set((model.collection[groupId]??[]).map(m=>m.eventId)).size)+(model.collectionMore[groupId]?'+':''):undefined} icon={Images} onPress={()=>navigation.navigate('GroupSharedEvents',{groupId})}/>
     <GroupSettingRow testID="group-info-notifications" title={copy('groups.notifications')} subtitle={copy(group.muted?'groups.notificationsMuted':'groups.notificationsOn')} icon={Bell}><Switch accessibilityLabel={copy('groups.notifications')} value={!group.muted} disabled={model.busy} trackColor={{false:colors.line,true:colors.accent}} onValueChange={enabled=>void model.store.action(groupId,{action:'mute',muted:!enabled}).then(ok=>setMuteError(ok?null:model.store.getSnapshot().error??'groups.failed'))}/></GroupSettingRow>
     {muteError&&<Text accessibilityRole="alert" style={g.error}>{copy(muteError)}</Text>}
    </View>
    <View style={{gap:16}}><View style={g.row}><Text style={[g.heading,{flex:1}]}>{copy('groups.members',{count:counts.accepted})}</Text>{owner&&<OutingPressable testID="group-info-invite" disabled={group.members.length>=GROUP_MEMBER_LIMIT} onPress={()=>open({kind:'invite'})} style={[g.row,{minHeight:44,gap:6}]}><UserPlus size={18} color={colors.accent}/><Text style={[g.body,{color:colors.accent}]}>{copy('groups.inviteFriends')}</Text></OutingPressable>}</View>
     {group.members.map(member=><View key={member.userId} testID={'group-info-member-'+member.userId} style={{gap:4}}><View style={[g.row,{minHeight:54}]}><MemberAvatar name={member.username} uri={member.avatarUrl} userId={member.userId} size={40}/><View style={{flex:1,gap:3}}><Text style={g.body}>{member.username}</Text><Text style={g.muted}>{copy(member.status==='pending'?'groups.pending':member.userId===group.ownerId?'groups.groupOwner':'groups.memberRole')}</Text></View></View>{owner&&member.userId!==model.user?.id&&<View style={{flexDirection:'row',flexWrap:'wrap',paddingLeft:52,gap:8}}>{member.status==='accepted'&&<ActionButton testID={'group-transfer-'+member.userId} title={copy('groups.transfer')} tone="ghost" size="compact" onPress={()=>open({kind:'transfer',userId:member.userId})} style={{paddingHorizontal:0}}/>}<ActionButton testID={'group-remove-'+member.userId} title={copy(member.status==='pending'?'groups.cancelInvitation':'groups.remove')} tone="ghost" size="compact" onPress={()=>open({kind:'remove',userId:member.userId})} style={{paddingHorizontal:0}}/></View>}</View>)}
    </View>
    <Text style={g.muted}>{copy('groups.privacy')}</Text>
    <GroupSettingRow testID="group-info-leave" title={copy('groups.leave')} icon={LogOut} danger onPress={()=>open({kind:'leave'})}/>
   </>}
  </ScrollView></GroupAccess>
  {panel&&group?.status==='accepted'&&!model.revoked.includes(groupId)&&<GroupInfoAction key={panel.kind+':'+panel.userId} group={group} model={model} panel={panel} closing={closing} close={close} dismissed={dismissed} onLeave={leave} leaveBlocked={!!owner&&others.length>0}/>}
 </GroupPage>;
}
function GroupInfoAction({group,model,panel,closing,close,dismissed,onLeave,leaveBlocked}:{group:FriendGroup;model:ReturnType<typeof useGroups>;panel:Panel;closing:boolean;close:()=>void;dismissed:()=>void;onLeave:()=>Promise<unknown>;leaveBlocked:boolean}){
 const {copy}=usePreferences(),[name,setName]=useState(group.name),[q,setQ]=useState(''),[selected,setSelected]=useState<string[]>([]),[error,setError]=useState<string|null>(null),[saving,setSaving]=useState(false);
 const alive=useRef(true),pending=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{if(panel.kind==='invite')void model.store.loadFriends()},[panel.kind,model.store]);
 const target=group.members.find(member=>member.userId===panel.userId),title=copy(panel.kind==='rename'?'groups.rename':panel.kind==='invite'?'groups.inviteFriends':panel.kind==='leave'?'groups.leave':panel.kind==='transfer'?'groups.transfer':target?.status==='pending'?'groups.cancelInvitation':'groups.remove');
 const available=model.friends.filter(friend=>!group.members.some(member=>member.userId===friend.id)&&friend.username.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()));
 const authorized=panel.kind==='leave'||group.ownerId===model.user?.id;
 useEffect(()=>{if(!authorized)close()},[authorized]);
 const current=useRef(!closing);current.current=!closing&&authorized;
 const save=async()=>{
  if(pending.current||closing||!authorized)return;pending.current=true;setSaving(true);setError(null);
  const run=(payload:Parameters<typeof model.store.action>[1])=>model.store.action(group.id,payload);
  let ok:unknown;
  try{
   if(panel.kind==='rename')ok=await run({action:'rename',name:name.trim()});
   else if(panel.kind==='invite'){
    ok=true;for(const userId of selected){const result=await run({action:'invite',userId});if(!result){ok=false;break}if(alive.current)setSelected(old=>old.filter(id=>id!==userId))}
   }else ok=panel.kind==='leave'?await onLeave():await run({action:panel.kind==='transfer'?'transfer-admin':'remove',userId:panel.userId!});
   if(alive.current&&current.current){if(ok){if(panel.kind!=='leave')close()}else setError(model.store.getSnapshot().error??'groups.failed')}
  }finally{pending.current=false;if(alive.current)setSaving(false)}
 };
 const disabled=closing||!authorized||(panel.kind==='rename'?!name.trim()||name.trim()===group.name:panel.kind==='invite'?!selected.length:panel.kind==='leave'&&leaveBlocked);
 return <GroupActionSheet title={title} testID="group-info-action" height={panel.kind==='invite'?.7:.46} closing={closing} onRequestClose={close} onDismiss={dismissed} footer={<View style={{gap:8}}>{!closing&&authorized&&<ActionButton testID={panel.kind==='rename'?'group-rename-save':panel.kind==='invite'?'group-invite-save':'group-info-confirm'} title={title} tone={panel.kind==='leave'||panel.kind==='remove'?'danger':'primary'} disabled={disabled} busy={saving} onPress={()=>void save()}/>}<ActionButton testID={panel.kind==='rename'?'group-rename-cancel':'group-info-cancel'} title={copy('common.cancel')} tone="ghost" onPress={close}/></View>}>
  {panel.kind==='rename'?<FormInput testID="group-rename-input" inSheet value={name} onChangeText={setName} accessibilityLabel={copy('groups.name')} maxLength={80} returnKeyType="done" onSubmitEditing={()=>{if(!disabled)void save()}}/>:panel.kind==='invite'?<>
   <GroupSearchField value={q} onChangeText={setQ} label={copy('groups.selectFriends')} inSheet/>
   {model.friendsLoading?<Loading/>:model.friendsError?<Feedback compact title={copy(model.friendsError)} retry={()=>void model.store.loadFriends()}/>:!available.length?<Text style={g.muted}>{copy('groups.noFriendsAvailable')}</Text>:available.map(friend=><OutingPressable testID={'group-invite-friend-'+friend.id} key={friend.id} accessibilityRole="checkbox" aria-checked={selected.includes(friend.id)} accessibilityState={{checked:selected.includes(friend.id)}} disabled={!selected.includes(friend.id)&&selected.length>=GROUP_MEMBER_LIMIT-group.members.length} onPress={()=>setSelected(old=>old.includes(friend.id)?old.filter(id=>id!==friend.id):[...old,friend.id])} style={[g.row,{minHeight:56}]}><MemberAvatar name={friend.username} uri={friend.avatarUrl} userId={friend.id}/><Text style={[g.body,{flex:1}]}>{friend.username}</Text>{selected.includes(friend.id)&&<Check size={19} color={colors.accent}/>}</OutingPressable>)}
  </>:<Text style={g.body}>{copy(panel.kind==='leave'?leaveBlocked?'groups.transferRequired':'groups.leaveConfirm':panel.kind==='transfer'?'groups.transferConfirm':target?.status==='pending'?'groups.confirmCancelInvite':'groups.confirmRemove',{name:target?.username??''})}</Text>}
  {error&&<Text accessibilityRole="alert" style={g.error}>{copy(error)}</Text>}
 </GroupActionSheet>;
}
