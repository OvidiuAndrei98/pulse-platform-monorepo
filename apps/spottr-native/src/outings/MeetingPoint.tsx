import React, { useState } from 'react';
import { View } from 'react-native';
import { FormInput } from '../ui/FormInput';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';

export function MeetingPoint({value,editable,busy,onSave}:{value:string;editable:boolean;busy:boolean;onSave:(value:string)=>Promise<boolean>}) {
  const {copy}=usePreferences(),[draft,setDraft]=useState<string|null>(null);
  return <View style={{gap:10}}><Text style={{color:colors.text,fontWeight:'600'}}>{copy('eventNight.meeting')}</Text>
    {editable?<><FormInput testID="night-meeting" accessibilityLabel={copy('eventNight.meeting')} value={draft??value} onChangeText={setDraft} maxLength={160} editable={!busy}/><ActionButton title={copy('common.save')} tone="secondary" disabled={busy||!draft?.trim()} onPress={()=>void onSave(draft!.trim()).then(ok=>{if(ok)setDraft(null);})}/></>:!!value&&<Text style={{color:colors.text}}>{value}</Text>}
    <Text style={{color:colors.muted,fontSize:12}}>{copy('eventNight.meetingHint')}</Text>
  </View>;
}
