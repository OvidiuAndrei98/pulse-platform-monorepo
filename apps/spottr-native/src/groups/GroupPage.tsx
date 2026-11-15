import React from 'react';
import {View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ChevronRight,type LucideIcon} from 'lucide-react-native';
import {GroupBack} from './GroupBack';
import {Text} from '../ui/Text';
import {Feedback,Loading} from '../ui/common';
import {OutingPressable} from '../outings/OutingPrimitives';
import {useGroups} from './useGroups';
import {usePreferences} from '../usePreferences';
import {colors} from '../ui/theme';
import {groupStyles as g} from './groupStyles';
export {groupStyles as g} from './groupStyles';

export function GroupPage({groupId,title,testID,children,action}:{groupId:string;title:string;testID:string;children:React.ReactNode;action?:React.ReactNode}){
 const safe=useSafeAreaInsets(),navigation=useNavigation<any>();
 return <View testID={testID} style={[g.root,{paddingTop:safe.top}]}><View style={g.header}><GroupBack testID={testID+'-back'} onPress={()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('FriendGroup',{id:groupId})}/><Text accessibilityRole="header" style={[g.title,{flex:1}]}>{title}</Text>{action}</View>{children}</View>;
}
export function GroupAccess({model,groupId,children}:{model:ReturnType<typeof useGroups>;groupId:string;children:React.ReactNode}){
 const {copy}=usePreferences();
 const group=model.groups.find(g=>g.id===groupId);
 if(!model.ready)return <Loading/>;
 if(!model.user)return <View style={g.content}><Feedback compact title={copy('groups.sessionEnded')}/></View>;
 if(!group&&!model.revoked.includes(groupId)&&!model.error)return <Loading/>;
 if(!group||group.status!=='accepted'||model.revoked.includes(groupId))return <View style={g.content}><Feedback compact title={copy(model.error??(group?.status==='pending'?'groups.invited':'groups.accessLost'))} retry={()=>void model.store.load(groupId)}/></View>;
 return <>{children}</>;
}
export function GroupSettingRow({title,subtitle,icon:Icon,onPress,children,testID,danger=false,disabled=false}:{title:string;subtitle?:string;icon?:LucideIcon;onPress?:()=>void;children?:React.ReactNode;testID?:string;danger?:boolean;disabled?:boolean}){
 const body=<>{Icon&&<Icon size={21} color={danger?colors.danger:colors.muted}/>}<View style={{flex:1,minWidth:0,gap:4}}><Text style={[g.body,danger&&{color:colors.danger}]}>{title}</Text>{!!subtitle&&<Text style={g.muted}>{subtitle}</Text>}</View>{children??(onPress&&<ChevronRight size={18} color={colors.muted}/>)}</>;
 return onPress?<OutingPressable testID={testID} disabled={disabled} accessibilityLabel={title} onPress={onPress} style={g.setting}>{body}</OutingPressable>:<View testID={testID} style={g.setting}>{body}</View>;
}
