import React from 'react';
import {View} from 'react-native';
import type {GroupMessage} from '@packages/app-core/social/groups';
import {groupUpdateSummary} from '@packages/app-core/social/groupPresentation';
import {Text} from '../ui/Text';
import {usePreferences} from '../usePreferences';
import {groupStyles as g} from './groupStyles';

/** Only provable changes belong in the conversation. Raw snapshots remain in
 * the store and the outing's full history, including changes without a delta. */
export function GroupHistoryUpdates({messages,allMessages=messages}:{messages:readonly GroupMessage[];allMessages?:readonly GroupMessage[]}){
 const {copy,language}=usePreferences('copy');
 const entries=[...messages].sort((a,b)=>a.seq-b.seq).map(message=>{
  const previous=allMessages.find(item=>item.outingId===message.outingId&&item.seq+1===message.seq);
  return {message,summary:groupUpdateSummary(message,previous,language,copy)};
 }).filter(({message,summary})=>summary!==copy('groups.updateGeneric',{name:message.username.trim()})&&summary!==copy('groups.updateAnonymous'));
 if(!entries.length)return null;
 return <View testID={'group-history-updates-'+messages[0]!.id} style={[g.message,{paddingTop:3,paddingBottom:3,gap:4}]}>
  {entries.map(({message,summary})=><Text key={message.id} testID={'group-system-update-'+message.id} style={g.caption}>{summary}</Text>)}
 </View>;
}
