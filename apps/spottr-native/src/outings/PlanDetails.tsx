import React,{useState} from 'react';
import { Share,View,useWindowDimensions } from 'react-native';
import { Check,LockKeyhole,MapPin,Plus,Share2,Ticket,UsersRound } from 'lucide-react-native';
import { optionVoters } from '@packages/app-core/outings/presentation';
import type { OutingPlan } from '@packages/app-core/outings/model';
import { ActionButton } from '../ui/ActionButton';
import { AppModal } from '../ui/AppModal';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { usePreferences } from '../usePreferences';
import { formatDate } from '../data/events';
import { useToast } from '../ui/ToastProvider';
import { WEB_URL } from '../config';
import { PlanProposals } from './PlanProposals';
import { DateBlock,MemberAvatar,OutingBadge,OutingMeta,OutingProgress } from './OutingPrimitives';
import { o } from './outingsStyles';
import type { useOutings } from './useOutings';

export function PlanDetails({plan,model,onEvent,onNight,onGroup}:{
  plan:OutingPlan;model:ReturnType<typeof useOutings>;onEvent:(id:string)=>void;onNight:(id:string)=>void;onGroup:(id:string)=>void;
}) {
  const {copy,language}=usePreferences(),toast=useToast(),wide=useWindowDimensions().width>=850;
  const accepted=plan.status==='accepted',own=plan.ownerId===model.user?.id,mine=plan.members.find(member=>member.userId===model.user?.id),members=plan.members.filter(member=>member.status==='accepted');
  const [adding,setAdding]=useState(!plan.options.length),[confirmation,setConfirmation]=useState<string|null>(null);
  const choice=plan.options.find(option=>option.eventId===confirmation);
  const amount=(value:number)=>new Intl.NumberFormat(language==='ro'?'ro-RO':'en-GB',{maximumFractionDigits:2}).format(value);
  const share=async()=>{try{await Share.share({message:plan.title+'\n'+WEB_URL+'/outings?plan='+plan.id});}catch{toast.show({key:'feedback.shareFailed',kind:'error'});}};
  const confirm=async()=>{if(!choice||model.working||!own)return;if(await model.store.choose(plan.id,choice.eventId))setConfirmation(null);};
  const participants=<View style={o.section}>
    <View style={o.split}><View style={o.row}><UsersRound size={20} color={colors.text}/><Text style={o.heading}>{copy('outings.ui.participants')}</Text></View><Text style={o.caption}>{plan.members.length}</Text></View>
    <View>{plan.members.map((member,index)=><View key={member.userId} style={[o.member,index>0&&{borderTopWidth:1,borderTopColor:colors.line}]}>
      <MemberAvatar name={member.username}/><View style={{flex:1,minWidth:0}}><Text style={o.label}>{member.username}</Text><Text style={o.caption}>{copy(plan.chosenEventId&&member.status==='accepted'?(member.hasTicket?'outings.hasTicket':'outings.needsTicket'):'outings.'+member.status)}</Text></View>
      {plan.chosenEventId&&member.hasTicket&&<Check size={16} color={colors.text}/>}
    </View>)}</View><Text style={o.caption}>{copy(plan.chosenEventId?'outings.ticketPrivacy':'outings.ui.privacyHint')}</Text>
  </View>;
  return <View style={o.stack}>
    <View style={{gap:16}}>
      <View style={o.split}><View style={[o.row,{gap:8}]}><LockKeyhole size={14} color={colors.muted}/><Text style={o.caption}>{copy('outings.ui.private')}</Text></View><ActionButton accessibilityLabel={copy('outings.share')} tone="secondary" disabled={model.working} icon={<Share2 size={18}/>} style={{width:44,paddingHorizontal:10}} onPress={()=>void share()}/></View>
      <Text accessibilityRole="header" style={o.title}>{plan.title}</Text><OutingMeta plan={plan}/>
    </View>
    {!accepted?<View style={o.section}><Text style={o.heading}>{copy('outings.ui.invitationTitle')}</Text><Text style={o.muted}>{copy('outings.ui.invitationBody')}</Text>
      <ActionButton title={copy('outings.accept')} busy={model.working} onPress={()=>void model.store.respondPlan(plan.id,'accepted')}/><ActionButton title={copy('outings.decline')} tone="secondary" disabled={model.working} onPress={()=>void model.store.respondPlan(plan.id,'declined')}/>
    </View>:<>
      <OutingProgress plan={plan}/>
      <View style={{flexDirection:wide?'row':'column',gap:24,alignItems:wide?'flex-start':'stretch'}}>
        <View style={{flex:1,minWidth:0,gap:24}}>
          <View style={o.split}><View style={{flex:1,minWidth:0,gap:6}}><Text style={o.heading}>{copy(plan.chosenEventId?'outings.ui.chosenDate':'outings.events')}</Text><Text style={o.muted}>{copy(plan.chosenEventId?'outings.ui.preparationHint':'outings.ui.proposalHint')}</Text></View>{!plan.chosenEventId&&<Text style={o.caption}>{copy('outings.ui.proposalsCount',{count:plan.options.length})}</Text>}</View>
          {plan.chosenEventId&&<View style={o.section}>
            <View style={o.row}><Ticket size={20} color={colors.text}/><Text style={o.heading}>{copy('outings.ticketsReady')}</Text></View><Text style={o.muted}>{copy(mine?.hasTicket?'outings.ui.readyHint':'outings.ui.needTicketHint')}</Text>
            {mine?.hasTicket?<><ActionButton title={copy('outings.night')} onPress={()=>onNight(plan.chosenEventId!)}/><ActionButton title={copy('outings.openGroup')} tone="secondary" onPress={()=>onGroup(plan.chosenEventId!)}/></>:<ActionButton title={copy('outings.buyTicket')} onPress={()=>onEvent(plan.chosenEventId!)}/>}
            <Text style={o.caption}>{copy('outings.chosenHint')}</Text>
          </View>}
          {plan.options.map(event=>{
            const voters=optionVoters(plan,event.eventId),voted=mine?.voteEventId===event.eventId,chosen=plan.chosenEventId===event.eventId;
            return <View key={event.eventId} style={[o.section,chosen&&{borderColor:colors.accent}]}>
              {chosen&&<OutingBadge label={copy('outings.chosen')} tone="success"/>}
              <View style={[o.row,{alignItems:'flex-start'}]}><DateBlock day={plan.outingDate}/><View style={{flex:1,minWidth:0,gap:8}}>
                <Text style={[o.heading,{fontSize:20,lineHeight:27}]}>{event.title}</Text>
                <View style={[o.row,{gap:6,alignItems:'flex-start'}]}><MapPin size={14} color={colors.muted}/><Text style={[o.muted,{flex:1}]}>{event.location} · {formatDate(event.startTime,language,true)}</Text></View>
                {event.priceRon!==undefined&&event.ticketAvailability!=='external'&&<Text style={o.label}>{event.priceRon===0?copy('outings.free'):copy('outings.priceFrom',{amount:amount(event.priceRon)})}</Text>}
              </View></View>
              {event.ticketAvailability&&<Text style={o.caption}>{copy('outings.availability.'+event.ticketAvailability)}</Text>}
              {!event.available&&<Text style={o.caption}>{copy('outings.unavailable')}</Text>}
              {!plan.chosenEventId&&<><View style={o.split}><Text style={o.muted}>{copy(voters.length?'outings.votes':'outings.ui.noVotes',{count:voters.length})}</Text>{voted&&<View style={[o.row,{gap:6}]}><Check size={15} color={colors.text}/><Text style={o.caption}>{copy('outings.ui.voted')}</Text></View>}</View>
              <View style={o.voteTrack} accessible={false}><View style={{height:4,backgroundColor:colors.accent,width:(members.length?voters.length/members.length*100:0)+'%' as `${number}%`}}/></View></>}
              <View style={[o.row,{flexWrap:'wrap'}]}>
                {!plan.chosenEventId&&event.available&&<>
                  <ActionButton testID={'outing-vote-'+event.eventId} title={copy(voted?'outings.ui.voted':'outings.vote')} icon={voted?<Check size={16}/>:undefined} accessibilityState={{selected:voted}} tone="secondary" disabled={model.working} onPress={()=>void model.store.vote(plan.id,event.eventId)}/>
                  {own&&<ActionButton title={copy('outings.choose')} tone="ghost" disabled={model.working} onPress={()=>setConfirmation(event.eventId)}/>}
                </>}
                <ActionButton title={copy('outings.viewEvent')} tone="ghost" onPress={()=>onEvent(event.eventId)}/>
              </View>
            </View>;
          })}
          {!plan.chosenEventId&&plan.outingDate&&plan.city&&<>
            <ActionButton title={copy('outings.propose')} icon={<Plus size={18}/>} accessibilityState={{expanded:adding}} tone={plan.options.length?'secondary':'primary'} disabled={model.working||plan.options.length>=8} onPress={()=>setAdding(value=>!value)}/>
            {adding&&<PlanProposals plan={plan} model={model} onProposed={()=>setAdding(false)}/>}
          </>}
          {!plan.chosenEventId&&(!plan.outingDate||!plan.city)&&<Text style={o.muted}>{copy('outings.legacyContext')}</Text>}

        </View>
        <View style={[{minWidth:0},wide&&{width:300}]}>{participants}</View>
      </View>
    </>}
    <AppModal open={!!choice} onClose={()=>setConfirmation(null)} title={copy('outings.ui.confirmChoice')} dismissible={!model.working}
      footer={<><ActionButton title={copy('common.cancel')} tone="secondary" disabled={model.working} onPress={()=>setConfirmation(null)}/><ActionButton testID="outing-confirm-choice" title={copy('outings.ui.confirmDestination')} busy={model.working} onPress={()=>void confirm()}/></>}>
      <Text style={o.body}>{copy('outings.ui.confirmChoiceHint',{event:choice?.title??''})}</Text>
    </AppModal>
  </View>;
}
