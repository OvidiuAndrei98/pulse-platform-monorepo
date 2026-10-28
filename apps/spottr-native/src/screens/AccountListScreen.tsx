import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { ArrowLeft, Bookmark, Calendar, ChevronRight, ExternalLink, MapPin, QrCode, Receipt, Ticket } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused, useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../PreferencesProvider';
import { useTickets } from '../data/useTickets';
import { useOrders } from '../data/useOrders';
import { isConfirmedPurchase, isInvoiceOrder, invoiceStatusKey, orderStatusKey, orderTotalBani } from '../../../pulse-app/src/features/checkout/orderHistory';
import { TicketAvailability } from '../profile/TicketAvailability';
import { TicketSheet } from '../profile/TicketSheet';
import { ticketStatus, type UserTicket } from '../data/tickets';
import { EventImage, Feedback, Loading, useOpenLink } from '../ui/common';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { formatDate } from '../data/events';
import { seedEvent } from '../data/queries';
import type { RootParamList, ProfileParamList } from '../navigation/types';
import { formatRon } from '../../../pulse-app/src/features/events/serviceFee';

export function SavedEventsScreen() {
  const { saved, savedLoading, savedError, retrySaved, copy, language } = usePreferences();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  return <AccountPage id="saved-events-page" title={copy('userProfile.savedEvents')}>
    {savedLoading ? <Loading /> : savedError ? <Feedback title={copy('feedback.loadFailed')} retry={retrySaved} /> : saved.length ? saved.map(event => <Pressable key={event.id} accessibilityRole="button" onPress={() => { seedEvent(event); navigation.navigate('Event', { id: event.id }); }} style={{padding:12,borderRadius:16,borderWidth:1,borderColor:'#ffffff1a',backgroundColor:'#ffffff08',gap:12,flexDirection:'row',alignItems:'center'}}>
      <EventImage uri={event.bannerUrl} style={{ width: 48, height: 48, borderRadius: 12 }} /><View style={{ flex: 1, gap: 2 }}><Text numberOfLines={1} style={title}>{event.title}</Text><Text numberOfLines={1} style={muted}>{event.locationName} · {formatDate(event.startTime, language)}</Text></View><Bookmark size={16} color={colors.accent} fill={colors.accent} />
    </Pressable>) : <Text style={[muted,{padding:32,borderRadius:16,borderWidth:1,borderStyle:'dashed',borderColor:'#ffffff1a',textAlign:'center'}]}>{copy('userProfile.noSavedEvents')}</Text>}
  </AccountPage>;
}

export function TicketsScreen() {
  const focused = useIsFocused(), { user } = useAuth(), { copy, language } = usePreferences();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const [tab, setTab] = useState<'active' | 'history' | 'used' | 'expired'>('active'), [selected, setSelected] = useState<string | null>(null);
  const tickets = useTickets(focused, !!selected);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (focused) setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, [focused]);
  useEffect(() => { setSelected(null); setTab('active'); }, [user?.id]);
  const all = tickets.data ?? [], activeCount = all.filter(ticket => ticketStatus(ticket, now) === 'active').length;
  const data = all.filter(ticket => tab === 'history' ? ticketStatus(ticket, now) !== 'active' : ticketStatus(ticket, now) === tab);
  const groups = new Map<string, UserTicket[]>();
  for (const ticket of data) groups.set(ticket.eventId, [...(groups.get(ticket.eventId) ?? []), ticket]);
  const chosen = all.find(ticket => ticket.id === selected);
  return <><AccountPage id="tickets-page" title={copy('tickets.title')} large subtitle={tickets.isPending ? copy('common.loading') : tickets.isError ? '' : copy('tickets.count', {count:all.length})}>
    <View style={{ flexDirection: 'row', padding: 4, marginTop:12, backgroundColor: '#ffffff0a', borderWidth:1,borderColor:'#ffffff1a',borderRadius: 99 }}>{(['active', 'history'] as const).map(value => {
      const active = value === 'active' ? tab === 'active' : tab !== 'active';
      return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(value)} style={{ flex: 1, padding: 12, alignItems: 'center', borderRadius: 99, backgroundColor: active ? colors.accent : 'transparent' }}><Text style={title}>{copy('tickets.' + value)} <Text style={{fontSize:12}}>({value === 'active' ? activeCount : all.length - activeCount})</Text></Text></Pressable>;
    })}</View>
    {tab !== 'active' && <View style={{ flexDirection: 'row', gap: 8 }}>{(['history', 'used', 'expired'] as const).map(value => <Pressable key={value} accessibilityRole="button" onPress={() => setTab(value)} style={{ paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderColor:tab===value?'#ff00444d':'#ffffff1a',borderRadius:99,backgroundColor:tab===value?'#ff00441a':'transparent' }}><Text style={{ color: tab === value ? colors.accent : colors.muted, fontSize: 12 }}>{copy(value === 'history' ? 'tickets.allHistory' : 'tickets.' + value)}</Text></Pressable>)}</View>}
    <TicketAvailability offline={tickets.offline} savedAt={tickets.savedAt} storageError={tickets.storageError} refreshing={tickets.isFetching} onRefresh={() => void tickets.refetch()} />
    {tickets.isPending ? <Loading /> : tickets.isError ? <Feedback title={copy('feedback.loadFailed')} retry={() => void tickets.refetch()} /> : [...groups.values()].sort((a, b) => (Date.parse(a[0]!.startTime) - Date.parse(b[0]!.startTime)) * (tab === 'active' ? 1 : -1)).map((group,index) => {
      const event = group[0]!, featured = tab === 'active' && index === 0, happening = Date.parse(event.startTime)<=now;
      return <View key={event.eventId} style={{borderRadius:26,borderWidth:1,borderColor:featured?'#ff00444d':'#ffffff1a',backgroundColor:'#ffffff06',overflow:'hidden',marginTop:8}}>
        {featured && <LinearGradient pointerEvents="none" colors={['#ff00441f','#111111','#0a0a0a']} start={{x:0,y:0}} end={{x:1,y:1}} style={{position:'absolute',inset:0}} />}
        <View style={{padding:20,gap:12}}>
          {featured && <Text style={{color:colors.accent,fontWeight:'700',fontSize:10,letterSpacing:1.6,marginBottom:4}}>● {copy(happening?'tickets.happeningNow':'tickets.nextEvent').toUpperCase()}</Text>}
          <Text style={{color:'white',fontSize:featured?24:18,fontWeight:'700',letterSpacing:-0.5}}>{event.eventTitle}</Text>
          {Date.parse(event.endTime) + 86400000 >= now && <Pressable accessibilityRole="button" onPress={() => navigation.navigate('SafetyGroup', { eventId: event.eventId })} style={{ paddingVertical: 12 }}><Text style={{ color: '#6ee7b7', fontSize: 14 }}>{copy('safetyGroup.openOrCreate')}</Text></Pressable>}
          <View style={{flexDirection:'row',gap:8}}><Calendar size={16} color={colors.muted}/><Text style={muted}>{formatDate(event.startTime,language,true)}</Text></View>
          <View style={{flexDirection:'row',gap:8}}><MapPin size={16} color={colors.accent}/><Text style={[muted,{flex:1}]}>{event.locationName}</Text></View>
          {featured && <Pressable accessibilityRole="button" onPress={()=>setSelected(event.id)} style={{minHeight:48,backgroundColor:colors.accent,borderRadius:99,flexDirection:'row',gap:8,alignItems:'center',justifyContent:'center',marginTop:8}}><QrCode size={16} color="white"/><Text style={title}>{copy('tickets.showQr')}{group.length>1 ? ` (${group.length})` : ''}</Text></Pressable>}
        </View>
        {group.map((ticket,index)=>{const status=ticketStatus(ticket,now);return <Pressable key={ticket.id} accessibilityRole="button" onPress={()=>setSelected(ticket.id)} style={{minHeight:80,paddingHorizontal:20,paddingVertical:16,flexDirection:'row',gap:12,alignItems:'center',borderTopWidth:1,borderColor:'#ffffff1a'}}>
          <View style={{width:40,height:40,borderRadius:20,backgroundColor:status==='active'?'#ff00441a':'#ffffff0d',alignItems:'center',justifyContent:'center'}}><QrCode size={16} color={status==='active'?colors.accent:colors.muted}/></View>
          <View style={{flex:1,gap:4}}><Text style={title}>{ticket.ticketTypeName}</Text><Text style={muted}>{copy('tickets.ticketNumber',{count:index+1})}</Text></View>
          {status!=='active' && <Text style={muted}>{copy('tickets.'+status)}</Text>}<ChevronRight size={16} color={colors.muted}/>
        </Pressable>})}
      </View>;
    })}
    {!tickets.isPending && !tickets.isError && !data.length && <View style={{paddingHorizontal:20,paddingVertical:48,borderRadius:26,borderWidth:1,borderStyle:'dashed',borderColor:'#ffffff26',alignItems:'center',gap:12}}><Ticket size={28} color={colors.accent}/><Text style={title}>{copy(tab==='active'?'tickets.noUpcoming':'tickets.noHistory')}</Text><Text style={[muted,{textAlign:'center'}]}>{copy(tab==='active'?'tickets.noUpcomingHint':'tickets.emptyHint')}</Text>{tab==='active' && <Pressable accessibilityRole="button" onPress={()=>navigation.navigate('Tabs',{screen:'Explore'})} style={{paddingHorizontal:20,minHeight:44,borderRadius:99,backgroundColor:colors.accent,justifyContent:'center',marginTop:8}}><Text style={title}>{copy('tickets.exploreEvents')}</Text></Pressable>}</View>}
  </AccountPage>{chosen && user && <TicketSheet key={user.id} initialId={chosen.id} preferUnused={false} tickets={all.filter(item => item.eventId === chosen.eventId)} offline={tickets.offline} savedAt={tickets.savedAt} onClose={() => setSelected(null)} />}</>;
}

export function OrdersScreen() {
  const { copy, language } = usePreferences(), link = useOpenLink();
  const query = useOrders(), orders = query.data ?? [];
  return <AccountPage id="invoices-page" title={copy('orders.title')} subtitle={copy('orders.history')}>
    {query.isPending ? <Loading /> : query.isError ? <Feedback title={copy('feedback.loadFailed')} retry={() => void query.refetch()} /> : !orders.length ? <View style={{paddingHorizontal:20,paddingVertical:48,borderWidth:1,borderStyle:'dashed',borderColor:'#ffffff26',gap:8,alignItems:'center'}}><Receipt size={24} color={colors.accent}/><Text style={title}>{copy('orders.transactionsEmpty')}</Text><Text style={[muted,{textAlign:'center'}]}>{copy('orders.transactionsEmptyHint')}</Text></View> : <View style={{borderTopWidth:1,borderColor:'#ffffff1a'}}>{orders.map(order => {
      const paid = isConfirmedPurchase(order), hasInvoice = isInvoiceOrder(order);
      const refunded = order.status==='refunded' || order.refundedAmountBani>0;
      return <View key={order.id} testID={`invoice-${order.id}`} style={{paddingVertical:16,borderBottomWidth:1,borderColor:'#ffffff1a',gap:12,flexDirection:'row',alignItems:'flex-start'}}>
        <View style={{width:40,height:40,backgroundColor:'#ff00441a',alignItems:'center',justifyContent:'center'}}><Receipt size={16} color={colors.accent}/></View>
        <View style={{flex:1,gap:4}}><Text numberOfLines={1} style={title}>{order.eventTitle}</Text><View style={{flexDirection:'row',gap:4,alignItems:'center'}}><Calendar size={14} color={colors.muted}/><Text style={muted}>{formatDate(order.createdAt,language)}</Text></View><View style={{flexDirection:'row',gap:4}}><MapPin size={14} color={colors.muted}/><Text style={[muted,{flex:1}]}>{order.locationName}</Text></View><Text style={[muted,{fontSize:10}]}>{copy('orders.order',{id:order.id})}</Text></View>
        <View style={{maxWidth:'46%',alignItems:'flex-end',gap:4}}><Text style={title}>{formatRon(orderTotalBani(order)/100)}</Text><Text style={[muted,{fontSize:10}]}>{copy(paid?'orders.paidTotal':'orders.orderTotal')}</Text>
          {!paid && <Text style={[muted,{fontSize:11,textAlign:'right'}]}>{copy(orderStatusKey(order.status))}</Text>}
          {refunded && <Text style={invoiceText}>{copy('orders.refunded')}</Text>}
          {order.refundedAmountBani>0 && <Text style={invoiceText}>{copy('orders.refundedAmount',{amount:formatRon(order.refundedAmountBani/100)})}</Text>}
          {hasInvoice && (order.invoiceDocumentUrl ? <Pressable accessibilityRole="link" onPress={()=>void link.open(order.invoiceDocumentUrl!)} style={invoiceLink}><ExternalLink size={14} color={colors.accent}/><Text style={invoiceText}>{order.invoiceSeries} {order.invoiceNumber}</Text></Pressable> : <Text style={[muted,{fontSize:11,textAlign:'right'}]}>{copy('orders.invoiceStatus.'+invoiceStatusKey(order.invoiceStatus))}</Text>)}
          {hasInvoice && refunded && (order.refundInvoiceDocumentUrl ? <Pressable accessibilityRole="link" onPress={()=>void link.open(order.refundInvoiceDocumentUrl!)} style={[invoiceLink,{borderColor:'#ff004440'}]}><ExternalLink size={14} color={colors.accent}/><Text style={invoiceText}>{copy('orders.storno')} {order.refundInvoiceSeries} {order.refundInvoiceNumber}</Text></Pressable> : <Text style={[muted,{fontSize:11,textAlign:'right'}]}>{copy('orders.refundInvoiceStatus.'+invoiceStatusKey(order.refundInvoiceStatus))}</Text>)}
        </View>
      </View>;
    })}</View>}
    {link.error && <Feedback compact title={copy('feedback.actionFailed')} />}
  </AccountPage>;
}

function AccountPage({ id, title: heading, subtitle, large, children }: React.PropsWithChildren<{ id: string; title: string; subtitle?: string; large?: boolean }>) {
  const navigation = useNavigation<CompositeNavigationProp<NativeStackNavigationProp<ProfileParamList>,NativeStackNavigationProp<RootParamList>>>(), safe = useSafeAreaInsets(), { user, ready } = useAuth(), { copy } = usePreferences(), focused=useIsFocused();
  useEffect(() => { if (focused && ready && !user) navigation.navigate('Auth', { returnTab: 'Profile' }); }, [focused,ready,user,navigation]);
  if (!ready || !user) return <Loading />;
  return <ScrollView testID={id} style={{flex:1,backgroundColor:'#000'}} contentContainerStyle={{paddingHorizontal:20,paddingTop:Math.max(24,safe.top),paddingBottom:Math.max(28,safe.bottom+16),gap:16}}>
    <Pressable accessibilityRole="button" testID="account-back" onPress={()=>{ /* Only pop this profile stack: canGoBack also sees parent tabs. */ if(navigation.getState().index>0) navigation.goBack(); else navigation.replace('ProfileHome'); }} style={{flexDirection:'row',gap:6,minHeight:40,alignItems:'center'}}><ArrowLeft size={16} color={colors.muted}/><Text style={{color:colors.muted,fontSize:14}}>{copy('tickets.profile')}</Text></Pressable>
    <View style={{gap:large?8:4,marginBottom:12}}><Text style={{color:'white',fontSize:large?30:24,fontWeight:large?'700':'600',letterSpacing:large?-0.5:0}}>{heading}</Text>{!!subtitle && <Text style={{color:colors.muted,fontSize:14}}>{subtitle}</Text>}</View>{children}
  </ScrollView>;
}
const title = {color:'white',fontSize:14,fontWeight:'600' as const};
const muted = {color:colors.muted,fontSize:12,lineHeight:18};
const invoiceText = {color:colors.accent,fontSize:11,fontWeight:'600' as const};
const invoiceLink = {minHeight:32,borderWidth:1,borderColor:'#ffffff1a',borderRadius:8,paddingHorizontal:10,marginTop:4,flexDirection:'row' as const,gap:6,alignItems:'center' as const};
