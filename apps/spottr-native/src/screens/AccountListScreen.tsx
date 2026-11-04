import { AccentPressable } from '../ui/AccentPressable';
import { ActionIcon } from '../ui/ActionIcon';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View, type FlatListInstance } from 'react-native';
import { MotionPressable as Pressable } from '../ui/MotionPressable';
import { Bookmark, Calendar, ChevronRight, ExternalLink, MapPin, Receipt, Ticket } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StackActions, useIsFocused, useNavigation, type CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { usePreferences } from '../usePreferences';
import { useTickets } from '../data/useTickets';
import { useOrders } from '../data/useOrders';
import { isConfirmedPurchase, isInvoiceOrder, invoiceStatusKey, orderStatusKey, orderTotalBani } from '@packages/app-core/checkout/orderHistory';
import { TicketListViewport } from '../profile/TicketListViewport';
import { useWalletLists } from '../profile/useWalletLists';
import { GlassSegmentedControl } from '../ui/GlassSegmentedControl';
import { GlassPressable } from '../ui/GlassPressable';
import { TicketSheet } from '../profile/TicketSheet';
import { ticketStatus, type UserTicket } from '../data/tickets';
import { EventImage, Feedback, Loading, useOpenLink } from '../ui/common';
import { Text } from '../ui/Text';
import { colors } from '../ui/theme';
import { formatDate } from '../data/events';
import { seedEvent } from '../data/queries';
import type { RootParamList, ProfileParamList } from '../navigation/types';
import { formatRon } from '@packages/app-core/events/serviceFee';

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
  const focused = useIsFocused(), { user } = useAuth('account'), { copy } = usePreferences();
  const navigation = useNavigation<NativeStackNavigationProp<RootParamList>>();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [selected, setSelected] = useState<string | null>(null);
  const tickets = useTickets(focused, !!selected);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (focused) setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, [focused]);
  useEffect(() => { setSelected(null); setTab('active'); }, [user?.id]);
  const all = tickets.data ?? [];
  const openTicket = useCallback((ticket: UserTicket) => setSelected(ticket.id), []);
  const openGroup = useCallback((eventId: string) => navigation.navigate('SafetyGroup', { eventId }), [navigation]);
  const explore = useCallback(() => navigation.navigate('Tabs', { screen: 'Home' }), [navigation]);
  const { activeNodes, historyNodes, activeCount, historyFilter } = useWalletLists({
    all, now, owner: user?.id, pending: tickets.isPending, error: tickets.isError,
    retry: tickets.refetch, onOpen: openTicket, onGroup: openGroup, onExplore: explore,
  });
  const chosen = all.find(ticket => ticket.id === selected);
  return <><AccountPage id="tickets-page" title={copy('tickets.title')}
    subtitle={tickets.isPending ? copy('common.loading') : tickets.isError ? '' : copy('tickets.count', { count: all.length })}
    scrollKey={tab + ':' + historyFilter} pane={tab} historyContent={historyNodes}
    stickyControls={<GlassSegmentedControl testID="tickets-switch" role="tab" value={tab} onChange={setTab}
      options={(['active', 'history'] as const).map(value => ({ value, testID: 'tickets-tab-' + value,
        label: copy('tickets.' + value) + ' (' + (value === 'active' ? activeCount : all.length - activeCount) + ')' }))}/> }>
    {activeNodes}
  </AccountPage>{chosen && user && <TicketSheet key={user.id} initialId={chosen.id} preferUnused={false} tickets={all.filter(item => item.eventId === chosen.eventId)} onClose={() => setSelected(null)} />}</>;
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

function AccountPage({ id, title: heading, subtitle, large, stickyControls, scrollKey, pane = 'active', historyContent, children }: React.PropsWithChildren<{
  id: string; title: string; subtitle?: string; large?: boolean; stickyControls?: React.ReactNode; scrollKey?: string; pane?: 'active' | 'history'; historyContent?: React.ReactNode;
}>) {
  const navigation = useNavigation<CompositeNavigationProp<NativeStackNavigationProp<ProfileParamList>,NativeStackNavigationProp<RootParamList>>>(), safe = useSafeAreaInsets(), { user, ready } = useAuth('account'), { copy } = usePreferences(), focused=useIsFocused();
  const scroll = useRef<FlatListInstance>(null), historyScroll = useRef<FlatListInstance>(null), top = Math.max(12, safe.top);
  const activeRows = useMemo(() => React.Children.toArray(children), [children]);
  const historyRows = useMemo(() => React.Children.toArray(historyContent), [historyContent]);
  const [headerHeight, setHeaderHeight] = useState(top + 116);
  useEffect(() => { if (focused && ready && !user) navigation.navigate('Auth', { returnTab: 'Profile' }); }, [focused,ready,user,navigation]);
  useLayoutEffect(() => { if (scrollKey !== undefined) (pane === 'active' ? scroll : historyScroll).current?.scrollToOffset({ offset: 0, animated: false }); }, [scrollKey, pane]);
  const back = () => {
    // Pop the owning stack, not a parent's tab history.
    if(navigation.getState().index>0) navigation.goBack();
    else if(Platform.OS==='ios') navigation.dispatch(StackActions.replace('Tabs',{screen:'Profile'}));
    else navigation.replace('ProfileHome');
  };
  if (!ready || !user) return <Loading />;
  if (stickyControls) return <View testID={id} style={{ flex: 1, backgroundColor: colors.bg }}>
    {(['active', 'history'] as const).map(value => <View key={value} pointerEvents={pane === value ? 'auto' : 'none'}
      accessibilityElementsHidden={pane !== value} importantForAccessibility={pane === value ? 'auto' : 'no-hide-descendants'} aria-hidden={pane !== value}
      style={[StyleSheet.absoluteFill, { opacity: pane === value ? 1 : 0 }, Platform.OS === 'web' && pane !== value && ({ visibility: 'hidden' } as never)]}>
      <TicketListViewport testID={'tickets-' + value + '-list'} rows={value === 'active' ? activeRows : historyRows}
        scrollRef={value === 'active' ? scroll : historyScroll} top={headerHeight} bottom={safe.bottom}/>
    </View>)}
    <View pointerEvents="box-none" testID="tickets-sticky-header" onLayout={event => { const height = event.nativeEvent.layout.height; if (height > 0) setHeaderHeight(height); }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: top, paddingBottom: 16 }}>
      <LinearGradient pointerEvents="none" colors={['#000000', '#000000f5', '#00000000']} locations={[0, .46, 1]} style={StyleSheet.absoluteFill}/>
      <View pointerEvents="box-none" style={{ width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, gap: 12 }}>
        <View pointerEvents="box-none" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
          <GlassPressable testID="account-back" accessibilityLabel={copy('tickets.profile')} onPress={back}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
            <ActionIcon name="back" size={20} color={colors.text}/>
          </GlassPressable>
          <View pointerEvents="none" style={{ flex: 1, gap: 2 }}><Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -.5 }}>{heading}</Text>
            {!!subtitle && <Text style={{ color: colors.muted, fontSize: 11 }}>{subtitle}</Text>}</View>
        </View>
        {stickyControls}
      </View>
    </View>
  </View>;
  return <ScrollView testID={id} style={{flex:1,backgroundColor:'#000'}} contentContainerStyle={{paddingHorizontal:20,paddingTop:Math.max(24,safe.top),paddingBottom:Math.max(28,safe.bottom+16),gap:16}}>
    <Pressable accessibilityRole="button" testID="account-back" onPress={back} style={{flexDirection:'row',gap:6,minHeight:40,alignItems:'center'}}><ActionIcon name="back" size={16} color={colors.muted}/><Text style={{color:colors.muted,fontSize:14}}>{copy('tickets.profile')}</Text></Pressable>
    <View style={{gap:large?8:4,marginBottom:12}}><Text style={{color:'white',fontSize:large?30:24,fontWeight:large?'700':'600',letterSpacing:large?-0.5:0}}>{heading}</Text>{!!subtitle && <Text style={{color:colors.muted,fontSize:14}}>{subtitle}</Text>}</View>{children}
  </ScrollView>;
}

const title = {color:'white',fontSize:14,fontWeight:'600' as const};
const muted = {color:colors.muted,fontSize:12,lineHeight:18};
const invoiceText = {color:colors.accent,fontSize:11,fontWeight:'600' as const};
const invoiceLink = {minHeight:32,borderWidth:1,borderColor:'#ffffff1a',borderRadius:8,paddingHorizontal:10,marginTop:4,flexDirection:'row' as const,gap:6,alignItems:'center' as const};
