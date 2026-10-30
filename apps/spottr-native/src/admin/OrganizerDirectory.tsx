import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { accountApi,useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../PreferencesProvider';
import { Text } from '../ui/Text';
import { FormInput } from '../ui/FormInput';
import { colors } from '../ui/theme';
import { Feedback,Loading } from '../ui/common';
import { createAdminApi } from './data';
import { OrganizerCommissionSettings } from './CommissionsPanel';
import { isOrganizerId,organizerIssues } from '../../../pulse-app/src/features/admin/organizers';

const card = {padding:20,borderRadius:16,borderWidth:1,borderColor:colors.line,gap:14} as const;
const body = {fontSize:14,lineHeight:22,color:colors.muted};
const heading = {fontSize:26,fontWeight:'700',color:colors.text} as const;
const contents = {padding:20,gap:20,maxWidth:1100,width:'100%',alignSelf:'center',paddingBottom:50} as const;
function useApi() { const {controller}=useAuth();return useMemo(()=>createAdminApi(accountApi,()=>({token:controller.getToken(),role:controller.getSnapshot().user?.role})),[controller]); }
const status = (value:string,ro:boolean) => ({all:ro?'Toate':'All',pending:ro?'În verificare':'Pending',approved:ro?'Aprobat':'Approved',rejected:ro?'Respins':'Rejected',active:ro?'Activ':'Active',attention:ro?'De verificat':'Needs attention',onboarding:ro?'În configurare':'Onboarding',notConnected:ro?'Neconectat':'Not connected'}[value]??value);

export function OrganizerDirectory({organizerId}: {organizerId?:string}) { return organizerId ? <OrganizerDetail key={organizerId} id={organizerId}/> : <Directory />; }
function Directory() {
  const {user,controller}=useAuth(), {language}=usePreferences(), ro=language==='ro', api=useApi(),navigation=useNavigation<any>();
  const [draft,setDraft]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[cursors,setCursors]=useState(['']);
  const after=cursors[cursors.length-1]!,allowed=user?.role==='admin'&&!!controller.getToken();
  const query=useQuery({queryKey:['admin-directory',user?.id,search,filter,after],enabled:allowed,retry:false,queryFn:({signal})=>api.directory({search,status:filter,after},signal)});
  if(!allowed)return null;
  const submit=()=>{setSearch(draft.trim());setCursors(['']);};
  return <ScrollView contentContainerStyle={contents}><Text accessibilityRole="header" style={heading}>{ro?'Organizatori':'Organizers'}</Text><Text style={body}>{ro?'Firme, verificări, conturi Stripe și setări comerciale.':'Companies, verification, Stripe accounts and commercial settings.'}</Text>
    <View style={card}><Text style={{color:colors.text,fontWeight:'600'}}>{ro?'Caută organizator':'Search organizers'}</Text><FormInput accessibilityLabel={ro?'Firmă, CUI sau email':'Company, tax ID or email'} placeholder={ro?'Firmă, CUI sau email':'Company, tax ID or email'} value={draft} onChangeText={setDraft} onSubmitEditing={submit} maxLength={100} style={{borderWidth:1,borderColor:colors.muted,borderRadius:12,padding:14,fontSize:16,color:colors.text}}/><Action title={ro?'Caută':'Search'} onPress={submit}/><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{['all','pending','approved','rejected'].map(value=><Action key={value} title={status(value,ro)} selected={filter===value} onPress={()=>{setFilter(value);setCursors(['']);}}/>)}</View></View>
    {query.isPending?<Loading/>:query.isError?<Feedback title={ro?'Organizatorii nu pot fi încărcați. Verifică legătura cu API-ul.':'Unable to load organizers. Check the API connection.'} retry={()=>void query.refetch()}/>:<>
      {query.data.items.map(row=><Pressable key={row.userId} accessibilityRole="button" accessibilityLabel={(ro?'Deschide organizatorul ':'Open organizer ')+row.companyName} onPress={()=>navigation.push('Admin',{section:'organizers',organizerId:row.userId})} style={card}><Text style={{fontSize:17,fontWeight:'600',color:colors.text}}>{row.companyName}</Text><Text selectable style={body}>{row.email}</Text><Text style={body}>CUI {row.cui}</Text><Text style={{fontSize:13,color:colors.text}}>{status(row.verificationStatus,ro)} · Stripe: {status(row.stripeStatus,ro)} →</Text></Pressable>)}
      {!query.data.items.length&&<View style={card}><Text style={body}>{ro?'Niciun organizator găsit.':'No organizers found.'}</Text><Action title={ro?'Elimină filtrele':'Clear filters'} onPress={()=>{setDraft('');setSearch('');setFilter('all');setCursors(['']);}}/></View>}
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center',justifyContent:'space-between'}}><Action title={ro?'Anterior':'Previous'} disabled={cursors.length===1} onPress={()=>setCursors(values=>values.slice(0,-1))}/><Text style={body}>{ro?'Pagina':'Page'} {cursors.length}</Text><Action title={ro?'Următor':'Next'} disabled={!query.data.nextCursor} onPress={()=>setCursors(values=>[...values,query.data.nextCursor])}/></View>
    </>}
  </ScrollView>;
}
function OrganizerDetail({id}:{id:string}) {
  const {user,controller}=useAuth(),{language}=usePreferences(),ro=language==='ro',api=useApi(),navigation=useNavigation<any>(),[tab,setTab]=useState('profile');
  const allowed=user?.role==='admin'&&!!controller.getToken();
  const query=useQuery({queryKey:['admin-organizer-detail',user?.id,id],enabled:allowed&&isOrganizerId(id),retry:false,queryFn:({signal})=>api.detail(id,signal)});
  if(!allowed)return null;
  if(!isOrganizerId(id))return <Feedback title={ro?'Organizator invalid':'Invalid organizer'}/>;
  const row=query.data;
  const label=(roText:string,enText:string)=>ro?roText:enText;
  return <ScrollView contentContainerStyle={contents}><Action title={label('Înapoi la organizatori','Back to organizers')} onPress={()=>navigation.navigate('Admin',{section:'organizers',organizerId:undefined})}/>
    {query.isPending?<Loading/>:query.isError?<Feedback title={label('Profilul nu poate fi încărcat. Verifică legătura cu API-ul.','Unable to load profile. Check the API connection.')} retry={()=>void query.refetch()}/>:row&&<>
      <Text accessibilityRole="header" style={heading}>{row.companyName}</Text><Text selectable style={body}>{row.email} · @{row.username}</Text><Text style={body}>{status(row.verificationStatus,ro)} · Stripe: {status(row.stripeStatus,ro)} · {row.accountActive?label('Cont activ','Active account'):label('Cont inactiv','Inactive account')}</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{[[label('Evenimente','Events'),row.eventCount],[label('Viitoare','Upcoming'),row.upcomingCount],['Refund live',row.liveRefundsAttention],['Refund test',row.testRefundsAttention]].map(([title,value])=><View key={title} style={[card,{flexGrow:1,flexBasis:130}]}><Text style={body}>{title}</Text><Text style={{fontSize:24,fontWeight:'600',color:colors.text,fontVariant:['tabular-nums']}}>{value}</Text></View>)}</View>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[['profile',label('Date firmă','Company')],['events',label('Evenimente','Events')],['settings',label('Setări','Settings')],['issues',label('Probleme','Issues')]].map(([key,title])=><Action key={key} selected={tab===key} title={title!} onPress={()=>setTab(key!)}/>)}</View>
      {tab==='profile'&&<View style={card}>{[[label('Denumire legală','Legal company name'),row.companyName],['CUI',row.cui],[label('Adresă fiscală','Fiscal address'),row.fiscalAddress],['Email',row.email],['Stripe account',row.stripeAccountId],[label('Contract acceptat','Agreement accepted'),row.agreementAcceptedAt],[label('Versiune contract','Agreement version'),row.agreementVersion]].map(([title,value])=><View key={title} style={{gap:6}}><Text style={body}>{title}</Text><Text selectable style={{fontSize:15,lineHeight:23,color:colors.text}}>{value||'—'}</Text></View>)}<Action title={label('Deschide verificările','Open verifications')} onPress={()=>navigation.navigate('Admin',{section:'verifications',organizerId:undefined})}/></View>}
      {tab==='events'&&<View style={{gap:12}}><Text style={{fontSize:18,fontWeight:'600',color:colors.text}}>{label('Ultimele 20 de evenimente','Latest 20 events')}</Text>{row.recentEvents.map(event=><View style={card} key={event.id}><Text style={{fontSize:16,fontWeight:'600',color:colors.text}}>{event.title}</Text><Text style={body}>{new Intl.DateTimeFormat(ro?'ro-RO':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(event.startTime))} · {event.status}</Text><Text style={body}>{event.location||'—'}</Text></View>)}{!row.recentEvents.length&&<Text style={body}>{label('Nu există evenimente pentru acest organizator.','This organizer has no events.')}</Text>}</View>}
      {tab==='settings'&&<OrganizerCommissionSettings key={row.userId+':'+row.commissionRevision} organizer={row} saved={()=>void query.refetch()}/>}
      {tab==='issues'&&<View style={card}><Text style={{fontSize:18,fontWeight:'600',color:colors.text}}>{label('Verificări operaționale','Operational checks')}</Text>{organizerIssues(row,ro).map(issue=><Text key={issue} style={body}>• {issue}</Text>)}{!organizerIssues(row,ro).length&&<Text style={body}>{label('Nu sunt semnalate probleme de cont, Stripe sau restituiri.','No account, Stripe or refund issues are flagged.')}</Text>}<Action title={label('Deschide restituirile','Open refunds')} onPress={()=>navigation.navigate('Admin',{section:'refunds',organizerId:undefined})}/><Action title={label('Erori globale','Global errors')} onPress={()=>navigation.navigate('Admin',{section:'errors',organizerId:undefined})}/><Text style={body}>{label('Erorile aplicației sunt anonime și nu sunt atribuite acestui organizator.','Application errors are anonymous and are not attributed to this organizer.')}</Text></View>}
    </>}
  </ScrollView>;
}
function Action({title,onPress,disabled,selected}:{title:string;onPress:()=>void;disabled?:boolean;selected?:boolean}) {return <Pressable accessibilityRole="button" accessibilityState={{disabled:!!disabled,selected:!!selected}} disabled={disabled} onPress={onPress} style={{minHeight:44,borderRadius:12,borderWidth:1,borderColor:selected?colors.accent:colors.line,paddingHorizontal:16,paddingVertical:12,justifyContent:'center',opacity:disabled?.45:1}}><Text style={{fontSize:14,fontWeight:'600',color:selected?colors.accent:colors.text}}>{title}</Text></Pressable>;}
