import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { eventNightTickets } from '@packages/app-core/outings/model';
import { itemsText, pickupActive } from '@packages/app-core/wardrobe/model';
import { useTickets } from '../data/useTickets';
import { eventsApi } from '../data/api';
import { formatDate } from '../data/events';
import { useAuth, accountApi } from '../auth/AuthProvider';
import { useSafetyGroup } from '../safety/useSafetyGroup';
import { HoldForHelp } from '../safety/HoldForHelp';
import { useWardrobe } from '../wardrobe/useWardrobe';
import { TicketSheet } from '../profile/TicketSheet';
import { ActionButton } from '../ui/ActionButton';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { MeetingPoint } from './MeetingPoint';

export function EventNightScreen({eventId}:{eventId:string}) {
  const {user}=useAuth('account');
  return <EventNight key={eventId+':'+(user?.id??'guest')} eventId={eventId}/>;
}
function EventNight({eventId}:{eventId:string}) {
  const {copy,language}=usePreferences(),navigation=useNavigation<any>(),safe=useSafeAreaInsets(),focused=useIsFocused();
  const auth=useAuth('account'),tickets=useTickets(focused,true),safety=useSafetyGroup(eventId),wardrobe=useWardrobe(false,10_000);
  const event=useQuery({queryKey:['event-night',eventId,auth.user?.id],enabled:focused&&!!auth.user,retry:false,queryFn:({signal})=>eventsApi.event(eventId,signal)});
  const owned=eventNightTickets(tickets.data??[],eventId),group=safety.data?.group,[selected,setSelected]=useState('');
  const updates=useQuery({queryKey:['event-night-updates',eventId,auth.user?.id],enabled:focused&&!!owned.length,retry:false,queryFn:({signal})=>accountApi<Array<{id:string;caption?:string}>>('/events/'+eventId+'/updates',{signal})});
  const deposits=wardrobe.state.mine?.deposits.filter(d=>d.eventId===eventId)??[],ready=group?.currentMemberStatus==='accepted';
  return <View testID="event-night" style={{flex:1,backgroundColor:colors.bg,paddingTop:safe.top}}>
    <ScrollView contentContainerStyle={{padding:20,paddingBottom:safe.bottom+40,gap:20,maxWidth:760,width:'100%',alignSelf:'center'}}>
      <ActionButton title={copy('common.back')} tone="ghost" onPress={()=>navigation.canGoBack()?navigation.goBack():navigation.navigate('Tickets')}/>
      <Text accessibilityRole="header" style={{color:colors.text,fontSize:28,fontWeight:'700'}}>{copy('eventNight.title')}</Text>
      {!auth.user?<ActionButton title={copy('nav.profile')} onPress={()=>navigation.navigate('Auth',{returnEventNight:eventId})}/>:tickets.isPending||event.isPending?<ActivityIndicator color={colors.accent}/>:tickets.isError||event.isError?<ActionButton title={copy('common.retry')} onPress={()=>{void tickets.refetch();void event.refetch();}}/>:!owned.length?<Text style={{color:colors.muted}}>{copy('eventNight.noTicket')}</Text>:<>
        <Text style={{color:colors.text,fontSize:24,fontWeight:'700'}}>{event.data?.title}</Text>
        <Text style={{color:colors.muted}}>{formatDate(owned[0]!.startTime,language,true)} · {owned[0]!.locationName}</Text>
        <ActionButton testID="night-ticket" title={copy('eventNight.ticket')} onPress={()=>setSelected(owned.find(t=>!t.isValidated)?.id??owned[0]!.id)}/>
        <NightSection title={copy('eventNight.group')}>
          {safety.error&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{copy('safetyGroup.loadFailed')}</Text>}
          {safety.actionError&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{copy(safety.actionError.key??'outings.failed')}</Text>}
          {ready&&<>
            <MeetingPoint value={group.meetingPoint??''} editable={group.ownerId===auth.user?.id} busy={safety.working} onSave={content=>safety.controller.run({kind:'meeting-point',content})}/>
            <Text style={{color:colors.muted}}>{group.members.filter(m=>m.status==='accepted').map(m=>m.username).join(' · ')}</Text>
            {group.currentUserNeedsHelp?<ActionButton title={copy('safetyGroup.iAmSafe')} disabled={safety.working||!safety.active} onPress={()=>void safety.controller.run({kind:'help-resolved',content:copy('safetyGroup.safeMessage')})}/>
              :<HoldForHelp disabled={!group.canSendHelp||safety.working||!safety.active} onComplete={()=>void safety.controller.run({kind:'help',content:copy('safetyGroup.helpMessage')})}/>}
            {!group.canSendHelp&&<Text style={{color:colors.muted}}>{copy('safetyGroup.helpAfterValidation')}</Text>}
          </>}
          <Text style={{color:colors.muted}}>{copy('eventNight.groupHint')}</Text>
          <ActionButton title={copy('eventNight.openGroup')} tone="secondary" onPress={()=>navigation.navigate('SafetyGroup',{eventId})}/>
        </NightSection>
        <NightSection title={copy('eventNight.wardrobe')}>
          {deposits.map(d=><View key={d.id} style={{gap:10}}><Text style={{color:colors.text}}>{d.zoneName} · {d.number}</Text><Text style={{color:colors.muted}}>{itemsText(d.remaining,language==='ro')}</Text>
            {pickupActive(d)&&!d.pickupApproved&&<><Text style={{color:colors.muted}}>{copy('wardrobe.confirmHint')}</Text><ActionButton title={copy('wardrobe.approve')} disabled={wardrobe.state.busy} onPress={()=>void wardrobe.store.approve(d,true)}/><ActionButton title={copy('wardrobe.decline')} tone="secondary" disabled={wardrobe.state.busy} onPress={()=>void wardrobe.store.approve(d,false)}/></>}
          </View>)}
          {!deposits.length&&<Text style={{color:colors.muted}}>{copy('wardrobe.empty')}</Text>}
          {Boolean(wardrobe.state.error)&&<Text style={{color:colors.danger}}>{copy('wardrobe.error')}</Text>}
          <ActionButton title={copy('wardrobe.open')} tone="secondary" onPress={()=>navigation.navigate('Wardrobe')}/>
        </NightSection>
        <NightSection title={copy('eventNight.program')}>
          {event.data?.lineup.length?event.data.lineup.map((artist,index)=><View key={artist.name+index} style={{gap:4}}><Text style={{color:colors.text,fontWeight:'600'}}>{artist.name}</Text><Text style={{color:colors.muted}}>{[artist.performanceTime,artist.stage].filter(Boolean).join(' · ')}</Text></View>):<Text style={{color:colors.muted}}>{copy('eventNight.noProgram')}</Text>}
        </NightSection>
        <NightSection title={copy('eventNight.updates')}>
          {updates.isError?<ActionButton title={copy('common.retry')} tone="secondary" onPress={()=>void updates.refetch()}/>:updates.data?.length?updates.data.map(update=><Text key={update.id} style={{color:colors.text}}>{update.caption}</Text>):<Text style={{color:colors.muted}}>{copy('eventNight.noUpdates')}</Text>}
        </NightSection>
        <ActionButton title={copy('eventNight.details')} tone="secondary" onPress={()=>navigation.navigate('Event',{id:eventId})}/>
      </>}
    </ScrollView>
    {!!selected&&owned.some(t=>t.id===selected)&&<TicketSheet tickets={owned} initialId={selected} onClose={()=>setSelected('')}/>}
  </View>;
}
export function NightSection({title,children}:{title:string;children:React.ReactNode}) {
  return <View style={{borderWidth:1,borderColor:colors.line,borderRadius:24,padding:20,gap:14}}><Text accessibilityRole="header" style={{color:colors.text,fontSize:18,fontWeight:'600'}}>{title}</Text>{children}</View>;
}
