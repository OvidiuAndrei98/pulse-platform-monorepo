import { ActionIcon } from '../ui/ActionIcon';
import { GlassSurface } from '../ui/GlassSurface';
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { randomUUID } from "expo-crypto";
import { ArrowLeft, CalendarDays, ChevronDown, ChevronRight, RefreshCw, Shirt } from "lucide-react-native";
import { Text } from "../ui/Text";
import { FormInput } from "../ui/FormInput";
import { FormScrollView } from "../ui/KeyboardForms";
import { IconButton } from "../ui/common";
import { colors } from "../ui/theme";
import { DashboardDropdown } from "../dashboard/DashboardDropdown";
import { Action } from "../dashboard/common";
import { usePreferences } from "../usePreferences";
import { useAuth } from '../auth/AuthProvider';
import { operatorAccount, wardrobeEventPhase, wardrobeEventPhaseLabel, wardrobeTabLabel, changeItemCount, taskDeposits,wardrobeFlow,wardrobeTasks,availableZones,canReserveBelongings,wardrobeEventDescription,type WardrobeTask } from '../../../pulse-app/src/features/wardrobe/flow';
import { WardrobeTabs } from "./WardrobeTabs";
import { useWardrobe } from "./useWardrobe";
import {
  actionLabel,
  depositedSince,
  fitsZone,
  itemKeys,
  itemsText,
  pickupActive,
  totalItems,
  wardrobeError,
  wardrobeText,
  readProfileQR,
  type Items,
  type Command,
  type Deposit,
  type WardrobeEvent,
} from "../../../pulse-app/src/features/wardrobe/model";

export function WardrobeCard() {
  const { state, user } = useWardrobe(false, 20000),
    { language } = usePreferences(),
    navigation = useNavigation<any>(),
    c = wardrobeText(language === "ro");
  if (
    !user ||
    (!operatorAccount(user.role) && (!state.mine || (!state.mine.deposits.length && !state.mine.staffAccess)))
  )
    return null;
  const deposit = operatorAccount(user.role) ? undefined : state.mine?.deposits[0];
  return (
    <Pressable
      accessibilityRole="button"
      testID="wardrobe-card"
      onPress={() => navigation.navigate("Wardrobe", { staff: !deposit })}
      style={[s.card, s.active, s.row, { marginVertical: 12 }]}
    >
      <Shirt size={24} color="#ff0044" />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.bold}>{deposit ? c.active : c.staff}</Text>
        <Text style={s.small}>
          {deposit
            ? `${deposit.eventTitle} · ${deposit.number}${(state.mine?.deposits.length ?? 0) > 1 ? ` +${state.mine!.deposits.length - 1}` : ""}`
            : c.open}
        </Text>
      </View>
      <ChevronRight size={18} color="#9ca89e" />
    </Pressable>
  );
}
function Button({title,onPress,secondary=false,disabled=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}) {
  return <Action title={title} onPress={onPress} secondary={secondary} disabled={disabled}
    style={secondary ? s.secondaryAction : undefined} textStyle={{color:secondary ? colors.accent : '#ffffff'}} />;
}
function Counters({
  value,
  onChange,
  max,
  disabled,
  ro,
}: {
  value: Items;
  onChange: React.Dispatch<React.SetStateAction<Items>>;
  max?: Items;
  disabled?: boolean;
  ro: boolean;
}) {
  const c = wardrobeText(ro);
  return (
    <View>
      {itemKeys.map((key) => (
        <View key={key} style={[s.row, { paddingVertical: 6 }]}>
          <Text style={[s.text, { flex: 1 }]}>{c[key]}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`− ${c[key]}`}
            disabled={disabled || value[key] <= 0}
            onPress={() => onChange(current=>changeItemCount(current,key,-1,max))}
            style={s.counter}
          >
            <Text style={s.text}>−</Text>
          </Pressable>
          <Text style={s.bold}>{value[key]}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`+ ${c[key]}`}
            disabled={
              disabled ||
              totalItems(value) >= 20 ||
              value[key] >= (max?.[key] ?? 20)
            }
            onPress={() => onChange(current=>changeItemCount(current,key,1,max))}
            style={s.counter}
          >
            <Text style={s.text}>+</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
export function WardrobeScreen({
  route,
  embedded = false,
}: {
  route?: { params?: { staff?: boolean } };
  embedded?: boolean;
}) {
  const {user:sessionUser}=useAuth(),operatorOnly=operatorAccount(sessionUser?.role);
  const [staffChoice, setStaff] = useState(embedded || !!route?.params?.staff),staff=operatorOnly||staffChoice;
  const { store, state, user, active } = useWardrobe(staff),
    { language } = usePreferences(),
    navigation = useNavigation<any>(),
    safe = useSafeAreaInsets(),
    { width, height } = useWindowDimensions();
  const [task,setTask]=useState<WardrobeTask>('receive'),[intakeStep,setIntakeStep]=useState(0),[clientCode,setClientCode]=useState(''),[flowError,setFlowError]=useState(''),[advanced,setAdvanced]=useState(false),[setupTab,setSetupTab]=useState('zones');
  const ro = language === "ro",flow=wardrobeFlow(ro),
    c = wardrobeText(ro),
    overview=state.overview, o = overview,
    canManage=overview?.canManage ?? state.events.find(event=>event.id===state.eventId)?.canManage ?? false,
    d = state.selected,
    busy = state.busy;
  const [tab, setTab] = useState<
      "operations" | "setup" | "history" | "unclaimed"
    >("operations"),
    [zone, setZone] = useState(""),
    [items, setItems] = useState<Items>({ coat: 0, bag: 0, backpack: 0 });
  const [pickupItems, setPickupItems] = useState<Items>({
      coat: 0,
      bag: 0,
      backpack: 0,
    }),
    [adding, setAdding] = useState(false),
    [moveZone, setMoveZone] = useState("");
  const [camera, setCamera] = useState(false),
    cameraGate = useRef(false),
    [permission, requestPermission] = useCameraPermissions(),
    [cameraError, setCameraError] = useState(false);
  const [search, setSearch] = useState(""),
    [reason, setReason] = useState(""),
    [recovery, setRecovery] = useState(false);
  const [name, setName] = useState(""),
    [prefix, setPrefix] = useState("A"),
    [capacity, setCapacity] = useState("100"),
    [kind, setKind] = useState("any"),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("operator");
  const scroll = useRef<ScrollViewInstance>(null);
  const [pickupLookup,setPickupLookup]=useState<Deposit[]|null>(null);
  useEffect(() => {
    setZone("");
    setTask('receive');setIntakeStep(0);setClientCode('');setFlowError('');setAdvanced(false);
    setPickupLookup(null);
    setTab('operations');
    setSearch("");
  }, [state.eventId]);
  useEffect(() => {
    if (zone && o && !o.zones.some((z) => z.id === zone)) setZone('');
  }, [o, zone]);
  useEffect(() => {
    setPickupItems(
      d?.status === "stored"
        ? { ...d.remaining }
        : { coat: 0, bag: 0, backpack: 0 },
    );
    setRecovery(false);
    setReason("");
    setAdding(false);
  }, [
    d?.id,
    d?.status,
    d?.remaining.coat,
    d?.remaining.bag,
    d?.remaining.backpack,
  ]);
  useEffect(() => {
    setMoveZone("");setAdvanced(false);setAdding(false);
  }, [d?.id, d?.zoneId]);
  const act = (action: Command["action"], extra: Partial<Command> = {}) =>
    d &&
    void store.command({
      action,
      depositId: d.id,
      revision: d.revision,
      ...extra,
    });
  const reserve = (code: string, additional = false) =>
    store.reserve(code, zone, items, additional, randomUUID);
  const scan = async (code: string) => {
    if (cameraGate.current) return;
    cameraGate.current = true;
    setCamera(false);
    if(task==='pickup'){setPickupLookup([]);store.select();}else setClientCode('');
    const customer=readProfileQR(code); if (!customer) {setFlowError(flow.badCode);return;}
    setFlowError('');
    if(task==='pickup') {const result=await store.command({action:'lookup',code:'glow://friend/'+customer});if(result){const rows=(result.deposits??[]).filter(row=>row.status==='stored');setPickupLookup(rows);const current=store.snapshot().selected;store.select(rows.length===1?(current?.id===rows[0]!.id?current:rows[0]):undefined);}}
    else {setClientCode('glow://friend/'+customer);setIntakeStep(1);}
    scroll.current?.scrollTo({ y: 0, animated: true });
  };
  const beginTask=(value:WardrobeTask)=>{if(busy||d?.status==='reserved')return;setTask(value);setPickupLookup(null);setTab(value==='receive'||value==='pickup'?'operations':value);setClientCode('');setIntakeStep(0);setFlowError('');setAdvanced(false);setItems({coat:0,bag:0,backpack:0});setZone('');setSearch('');void store.change({history:value==='history',unclaimed:value==='unclaimed',search:''});};
  useEffect(()=>{if(task==='setup'&&!canManage){setTask('receive');setTab('operations');}},[task,canManage]);
  const nextClient=()=>{store.select();setClientCode('');setIntakeStep(0);setItems({coat:0,bag:0,backpack:0});setZone('');setAdvanced(false);};
  const [showOther,setShowOther]=useState(false);
  const activeEvents=state.events.filter(event=>wardrobeEventPhase(event)!=='other'),otherEvents=state.events.filter(event=>wardrobeEventPhase(event)==='other');
  const otherVisible=showOther;
  const enterEvent=(eventId:string)=>void store.change({eventId,history:false,unclaimed:false,search:''});
  const leaveEvent=()=>{if(!busy&&d?.status!=='reserved')void store.change({eventId:'',history:false,unclaimed:false,search:''});};
  useEffect(()=>{
    if(!staff||!user)return;
    if(Platform.OS==='web'){const heading=document.getElementById(state.eventId?'wardrobe-event-heading':'wardrobe-events-heading');heading?.setAttribute('tabindex','-1');if(heading)heading.style.outline='none';heading?.focus({preventScroll:true});}
    else AccessibilityInfo.announceForAccessibility(state.eventId?(state.events.find(event=>event.id===state.eventId)?.title??c.title):(ro?'Evenimente active':'Active events'));
  },[state.eventId,staff,user?.id]);
  const eventRow=(event:WardrobeEvent)=><Pressable key={event.id} accessibilityRole="button" accessibilityLabel={(ro?'Deschide garderoba: ':'Open cloakroom: ')+[event.title,wardrobeEventPhaseLabel(event,ro),wardrobeEventDescription(event,ro)].filter(Boolean).join(' · ')} testID={'wardrobe-event-'+event.id} disabled={busy} onPress={()=>enterEvent(event.id)} style={s.eventRow}><View style={s.eventIcon}><CalendarDays color="#9ca89e" size={22}/></View><View style={{flex:1,minWidth:0,gap:6}}><Text style={s.eventRowTitle}>{event.title}</Text><Text style={s.small}>{wardrobeEventDescription(event,ro)}</Text>{wardrobeEventPhase(event)!=='other'&&<Text style={s.small}>{wardrobeEventPhaseLabel(event,ro)}</Text>}</View><ChevronRight size={19} color="#f7faf2"/></Pressable>;

  const refreshControl = (
    <Pressable accessibilityRole="button" accessibilityLabel={c.refresh}
      accessibilityState={{ disabled: state.loading || busy }} disabled={state.loading || busy}
      onPress={() => void store.refresh(staff)} style={[s.refresh, { opacity: state.loading || busy ? .4 : 1 }]}>
      <GlassSurface tintColor={colors.accent} pointerEvents="none" accessible={false} style={s.refreshGlyph}><RefreshCw size={16} color="#ffffff" /></GlassSurface>
    </Pressable>
  );
  const button = (
    label: string,
    onPress: () => void,
    secondary = false,
    disabled = false,
  ) => (
    <Button
      title={label}
      onPress={onPress}
      secondary={secondary}
      disabled={busy || disabled}
    />
  );
  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    options: { numeric?: boolean; multiline?: boolean; max?: number } = {},
  ) => (
    <View style={s.formField}>
      <Text style={s.formLabel}>{label}</Text>
      <FormInput
        variant="billing"
        style={[s.formControl, options.multiline && s.formMultiline]}
        accessibilityLabel={label}
        value={value}
        onChangeText={set}
        editable={!busy}
        keyboardType={options.numeric ? "number-pad" : "default"}
        multiline={options.multiline}
        maxLength={options.max}
      />
    </View>
  );
  const select = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
  ) => (
    <View style={s.formField}>
      <Text style={s.formLabel}>{label}</Text>
      <DashboardDropdown
        label={label}
        hideLabel
        variant="billing"
        triggerStyle={s.formControl}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={c.select}
        disabled={busy}
      />
    </View>
  );
  const date = (value: string) =>
    new Date(value).toLocaleString(ro ? "ro-RO" : "en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  if (!user)
    return (
      <View style={[s.page, { paddingTop: safe.top + 20 }]}>
        {button(ro ? "Conectează-te" : "Sign in", () =>
          navigation.navigate("Auth"),
        )}
      </View>
    );
  const cameraSize = Math.max(
    120,
    Math.min(width - 48, height - safe.top - safe.bottom - 170, 440),
  );
  return (
    <View style={[s.root, { paddingTop: embedded ? 0 : safe.top }]}>
      {!embedded && (
        <View style={[s.row, { paddingHorizontal: 20, paddingVertical: 12 }]}>
          <IconButton
            label={c.back}
            onPress={() =>
              navigation.canGoBack()
                ? navigation.goBack()
                : navigation.navigate("Tabs", { screen: "Profile" })
            }
          >
            <ActionIcon name="back" size={20} color="white" />
          </IconButton>
          <Shirt color="#ff0044" />
          <Text style={s.title}>{c.title}</Text>
        </View>
      )}
      <FormScrollView
        ref={scroll}
        testID="wardrobe-page"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: safe.bottom + 110 }}
      >
        <View style={s.page}>
          {!staff&&<Text style={s.small}>{c.hint}</Text>}
          {!operatorOnly && (state.mine?.staffAccess || embedded) && (
            <View style={s.tabs}>
              <View style={{ flex: 1 }}>
                {button(c.mine, () => setStaff(false), staff)}
              </View>
              <View style={{ flex: 1 }}>
                {button(c.staff, () => setStaff(true), !staff)}
              </View>
            </View>
          )}
          {!!state.error && (
            <Text accessibilityRole="alert" style={s.error}>
              {wardrobeError(state.error, ro)}
            </Text>
          )}
          <Text accessibilityLiveRegion="polite" style={state.syncError&&!state.error?s.small:s.syncStatusEmpty}>{state.syncError&&!state.error?c.syncPaused:''}</Text>
          {!staff&&<View style={{alignItems:'flex-end'}}>{refreshControl}</View>}
          {!staff ? (
            <>
              {state.mine?.deposits.length === 0 && (
                <View style={s.card}>
                  <Text style={s.heading}>{c.empty}</Text>
                  <Text style={s.small}>{c.emptyHint}</Text>
                </View>
              )}
              {state.mine?.deposits.map((deposit) => (
                <View
                  key={deposit.id}
                  style={[s.card, s.active]}
                  testID="wardrobe-deposit"
                >
                  <View style={s.between}>
                    <Text style={[s.heading, { flex: 1 }]}>
                      {deposit.eventTitle}
                    </Text>
                    <Text style={s.badge}>{c[deposit.status]}</Text>
                  </View>
                  <Text
                    style={s.number}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.4}
                  >
                    {deposit.number}
                  </Text>
                  <Text style={s.small}>
                    {deposit.zoneName} · {itemsText(deposit.remaining, ro)}
                  </Text>
                  <Text style={s.small}>{date(deposit.createdAt)}</Text>
                  {pickupActive(deposit) && (
                    <View style={s.stack}>
                      <Text style={s.heading}>
                        {itemsText(deposit.pickupItems!, ro)}
                      </Text>
                      <Text style={s.small}>
                        {deposit.pickupApproved ? c.confirmed : c.confirmHint}
                      </Text>
                      {!deposit.pickupApproved &&
                        button(
                          c.approve,
                          () => void store.approve(deposit, true),
                        )}
                      {button(
                        c.decline,
                        () => void store.approve(deposit, false),
                        true,
                      )}
                    </View>
                  )}
                </View>
              ))}
              <View style={s.card}>
                <Text style={s.heading}>{c.code}</Text>
                <View style={s.qr}>
                  <QRCode value={`glow://friend/${user.id}`} size={180} />
                </View>
              </View>
            </>
          ) : (
            <>
              {!state.eventId?<>
                <View style={s.between}><Text nativeID="wardrobe-events-heading" accessibilityRole="header" style={s.heading}>{ro?'Evenimente active':'Active events'}</Text>{refreshControl}</View>
                <Text style={s.small}>{ro?'Alege evenimentul pentru primire, predare și gestionarea garderobei.':'Choose an event to receive, return and manage belongings.'}</Text>
                {state.loading&&!state.events.length&&<Text accessibilityLiveRegion="polite" style={s.small}>{c.loading}</Text>}
                <View>{activeEvents.map(eventRow)}</View>
                {!state.loading&&!activeEvents.length&&<Text style={s.small}>{!state.events.length?c.noEvents:ro?'Nu ai evenimente active. Evenimentele încheiate și ciornele sunt disponibile mai jos.':'No active events. Past events and drafts are available below.'}</Text>}
                {!!otherEvents.length&&<><Pressable accessibilityRole="button" accessibilityState={{expanded:otherVisible}} aria-controls={otherVisible?"wardrobe-other-events":undefined} onPress={()=>setShowOther(!otherVisible)} style={s.otherEvents}><Text style={s.bold}>{ro?'Alte evenimente':'Other events'} ({otherEvents.length})</Text>{otherVisible?<ChevronDown color="#f7faf2" size={18}/>:<ChevronRight color="#f7faf2" size={18}/>}</Pressable>{otherVisible&&<View nativeID="wardrobe-other-events">{otherEvents.map(eventRow)}</View>}</>}
              </>:<>
                <View style={s.between}><Pressable accessibilityRole="button" accessibilityLabel={ro?'Înapoi la evenimente':'Back to events'} disabled={busy||d?.status==='reserved'} accessibilityState={{disabled:busy||d?.status==='reserved'}} testID="wardrobe-back-events" onPress={leaveEvent} style={[s.backEvents,{opacity:busy||d?.status==='reserved'?.4:1}]}><ArrowLeft color="#f7faf2" size={18}/><Text style={s.bold}>{ro?'Înapoi la evenimente':'Back to events'}</Text></Pressable>{refreshControl}</View>
                <Text nativeID="wardrobe-event-heading" accessibilityRole="header" style={s.eventTitle}>{overview?.title||state.events.find(event=>event.id===state.eventId)?.title}</Text>
                <Text style={s.small}>{wardrobeEventDescription(state.events.find(event=>event.id===state.eventId)??{id:state.eventId,title:'',canManage},ro)}</Text>
                <WardrobeTabs id="wardrobe-operations" label={flow.operations} value={task} options={wardrobeTasks(canManage).map(value=>({value,label:wardrobeTabLabel(value,ro)}))} onChange={beginTask} disabled={busy} locked={d?.status==='reserved'} panelId="wardrobe-panel" ro={ro}/>
                {d?.status==='reserved'&&<Text accessibilityLiveRegion="polite" style={s.reservationHint}>{flow.reservationHint}</Text>}
              </>}
              {state.eventId && (
                <View nativeID="wardrobe-panel" role="tabpanel" aria-labelledby={'wardrobe-operations-'+task} style={s.stack}>
                  {!o&&<Text accessibilityLiveRegion="polite" style={s.small}>{c.loading}</Text>}
                  {o&&<>


                  {task==='setup'&&<WardrobeTabs id="wardrobe-settings" label={flow.settings} value={setupTab} options={[{value:'zones',label:ro?'Zone și obiecte':'Zones and items'},{value:'team',label:flow.team}]} onChange={setSetupTab} disabled={busy} panelId="wardrobe-settings-panel" ro={ro}/>}
                  {task==='pickup'&&<View style={s.card}><Text style={s.small}>{flow.pickupHint}</Text>{button(c.scan,()=>{cameraGate.current=false;setCameraError(false);setCamera(true);})}{pickupLookup!==null&&button(ro?'Caută alt client':'Find another customer',()=>{setPickupLookup(null);store.select();},true)}</View>}
                  {!!flowError&&<Text accessibilityLiveRegion="assertive" style={s.error}>{flowError}</Text>}

                  {tab === "history" && (
                    <Text style={s.small}>{c.retentionHint}</Text>
                  )}
                  {tab === "unclaimed" && (
                    <View
                      style={[s.card, s.active]}
                      testID="wardrobe-unclaimed-summary"
                    >
                      <Text style={s.heading}>
                        {c.unclaimedSummary(o.unclaimedCount, o.unclaimedItems)}
                      </Text>
                      <Text style={s.small}>
                        {o.eventEnded ? c.unclaimedHint : c.unclaimedPending}
                      </Text>
                    </View>
                  )}
                  {tab === "setup" && o.canManage ? (
                    <View nativeID="wardrobe-settings-panel" role="tabpanel" aria-labelledby={'wardrobe-settings-'+setupTab} style={s.stack}>
                      <View style={[s.card,setupTab!=='zones'&&{display:'none'}]}>
                        <Text style={s.heading}>{c.zone}</Text>
                        <Text style={s.small}>{c.zonesHint}</Text>
                        {o.zones.map((z) => (
                          <View key={z.id} style={s.stack}>
                            <Text style={s.bold}>
                              {z.name} · {z.prefix}001–{z.prefix}
                              {String(z.capacity).padStart(3, "0")}
                            </Text>
                            <Text style={s.small}>
                              {z.capacity - z.occupied} {c.free}
                            </Text>
                            {button(
                              z.enabled ? c.disable : c.enable,
                              () =>
                                void store.command({
                                  action: "zone",
                                  zoneId: z.id,
                                  name: z.name,
                                  prefix: z.prefix,
                                  kind: z.kind,
                                  capacity: z.capacity,
                                  revision: z.revision,
                                  enabled: !z.enabled,
                                }),
                              true,
                            )}
                          </View>
                        ))}
                        {field(c.zoneName, name, setName, { max: 60 })}
                        {field(
                          c.prefix,
                          prefix,
                          (value) => setPrefix(value.toUpperCase()),
                          { max: 8 },
                        )}
                        {field(c.capacity, capacity, setCapacity, {
                          numeric: true,
                        })}
                        {select(
                          c.kind,
                          kind,
                          setKind,
                          (["any", "coat", "bag"] as const).map((k) => ({
                            value: k,
                            label: c[k],
                          })),
                        )}
                        {button(
                          c.createZone,
                          () =>
                            void store.command({
                              action: "zone",
                              name,
                              prefix,
                              capacity: Number(capacity),
                              kind,
                              enabled: true,
                            }),
                          false,
                          !name.trim() ||
                            !/^[A-Z]{1,8}$/.test(prefix) ||
                            !/^\d+$/.test(capacity) ||
                            Number(capacity) < 1 ||
                            Number(capacity) > 2000,
                        )}
                      </View>
                      <View style={[s.card,setupTab!=='team'&&{display:'none'}]}>
                        <Text style={s.heading}>{c.team}</Text>
                        {o.staff.map((member) => (
                          <View style={s.stack} key={member.id}>
                            <Text style={s.bold}>
                              {member.name} · {c[member.role]}
                            </Text>
                            {button(
                              c.remove,
                              () =>
                                void store.command({
                                  action: "remove-staff",
                                  userId: member.id,
                                }),
                              true,
                            )}
                          </View>
                        ))}
                        {field(c.email, email, setEmail, { max: 254 })}
                        {select(c.team, role, setRole, [
                          { value: "operator", label: c.operator },
                          { value: "supervisor", label: c.supervisor },
                        ])}
                        {button(
                          c.addStaff,
                          () =>
                            void store.command({
                              action: "staff",
                              email,
                              role,
                            }),
                          false,
                          !email.includes("@"),
                        )}
                      </View>
                    </View>
                  ) : (
                    <>
                      {d && (
                        <View
                          style={[s.card, s.active]}
                          testID="wardrobe-selected"
                        >
                          <View style={s.between}>
                            <Text style={[s.heading, { flex: 1 }]}>
                              {d.customerName || c.unknown}
                            </Text>
                            <Pressable
                              accessibilityRole="button"
                              disabled={busy || d.status==='reserved'}
                              onPress={() => store.select()}
                            >
                              <Text style={s.small}>{c.close}</Text>
                            </Pressable>
                          </View>
                          <Text
                            style={s.number}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.4}
                          >
                            {d.number}
                          </Text>
                          <Text style={s.bold}>
                            {d.zoneName} · {c[d.status]}
                          </Text>
                          <Text style={s.small}>
                            {itemsText(d.remaining, ro)}
                          </Text>
                          {d.status === "reserved" && task === "receive" && (
                            <>
                              <Text style={s.small}>{c.storeHint}</Text>
                              {button(c.store, () => act("store"))}
                              {button(c.cancel, () => act("cancel"), true)}
                            </>
                          )}
                          {d.status === "stored" && (task === "pickup" || task === "unclaimed") && (
                            <>
                              <Text style={s.small}>{c.pickupHint}</Text>
                              <Counters
                                value={pickupItems}
                                onChange={setPickupItems}
                                max={d.remaining}
                                disabled={
                                  busy || (pickupActive(d) && !recovery)
                                }
                                ro={ro}
                              />
                              {pickupActive(d) ? (
                                <>
                                  <Text
                                    style={
                                      d.pickupApproved ? s.success : s.small
                                    }
                                  >
                                    {d.pickupApproved ? c.approved : c.waiting}
                                  </Text>
                                  <Text style={s.small}>
                                    {itemsText(d.pickupItems!, ro)}
                                  </Text>
                                  {d.pickupApproved &&
                                    button(c.handover, () =>
                                      act("return", { pickupId: d.pickupId! }),
                                    )}
                                </>
                              ) : (
                                button(
                                  c.pickup,
                                  () =>
                                    act("request-pickup", {
                                      items: pickupItems,
                                    }),
                                  false,
                                  !totalItems(pickupItems),
                                )
                              )}
                              {o.canRecover &&
                                button(
                                  c.recover,
                                  () => setRecovery(!recovery),
                                  true,
                                )}
                              {recovery && (
                                <View style={s.stack}>
                                  <Text style={s.small}>{c.recoveryHint}</Text>
                                  {field(c.reason, reason, setReason, {
                                    multiline: true,
                                    max: 300,
                                  })}
                                  {button(
                                    c.recoverConfirm,
                                    () =>
                                      act("recover", {
                                        reason,
                                        items: pickupItems,
                                      }),
                                    true,
                                    reason.trim().length < 12 ||
                                      !totalItems(pickupItems),
                                  )}
                                </View>
                              )}
                            </>
                          )}
                          {d.status !== 'reserved' && task === 'receive' && button(flow.nextClient,nextClient)}
                          {['reserved','stored'].includes(d.status) && (task==='receive'||task==='pickup'||task==='unclaimed') && button(flow.advanced,()=>setAdvanced(!advanced),true)}
                          {advanced && (d.status === "reserved" ||
                            d.status === "stored") && (
                            <>
                              <Text style={s.small}>{c.moveHint}</Text>
                              {select(
                                c.zone,
                                moveZone,
                                setMoveZone,
                                availableZones(d.remaining,o.zones).filter(z=>z.id!==d.zoneId).map((z) => ({
                                  value: z.id,
                                  label: `${z.name} · ${z.capacity - z.occupied} ${c.free}`,
                                })),
                              )}
                              {button(
                                c.move,
                                () => act("move", { zoneId: moveZone }),
                                true,
                                !availableZones(d.remaining,o.zones).some(z=>z.id===moveZone&&z.id!==d.zoneId),
                              )}
                              {d.userId &&
                                button(
                                  c.add,
                                  () => setAdding(!adding),
                                  true,
                                  !o.accepting,
                                )}
                              {adding && d.userId && (
                                <View style={s.stack}>
                                  <Text style={s.small}>{c.addHint}</Text>
                                  {select(
                                    c.zone,
                                    zone,
                                    setZone,
                                    availableZones(items,o.zones).map((z) => ({
                                      value: z.id,
                                      label: `${z.name} · ${z.capacity - z.occupied} ${c.free}`,
                                    })),
                                  )}
                                  <Counters
                                    value={items}
                                    onChange={setItems}
                                    disabled={busy}
                                    ro={ro}
                                  />
                                  {button(
                                    c.reserveMore,
                                    () =>
                                      void reserve(
                                        `glow://friend/${d.userId}`,
                                        true,
                                      ),
                                    false,
                                    !canReserveBelongings(items,zone,o.zones,o.accepting),
                                  )}
                                </View>
                              )}
                            </>
                          )}
                        </View>
                      )}
                      {task === 'receive' && !d && <View style={s.card} testID="wardrobe-intake">
                        <Text style={s.heading}>{[flow.scanClient,flow.items,flow.place][intakeStep]}</Text>
                        {!o.accepting&&<Text style={s.small}>{c.closed}</Text>}
                        {intakeStep===0&&<><Text style={s.small}>{flow.scanHint}</Text>{button(c.scan,()=>{cameraGate.current=false;setCameraError(false);setCamera(true);},false,!o.accepting)}</>}
                        {intakeStep===1&&<><Text style={s.small}>{flow.scanned}</Text><Counters value={items} onChange={setItems} disabled={busy} ro={ro}/>{button(flow.next,()=>{setZone('');setIntakeStep(2);},false,!totalItems(items))}{button(flow.back,()=>setIntakeStep(0),true)}</>}
                        {intakeStep===2&&<><Text style={s.small}>{itemsText(items,ro)}</Text>{select(c.zone,zone,setZone,availableZones(items,o.zones).map(z=>({value:z.id,label:z.name+' · '+(z.capacity-z.occupied)+' '+c.free})))}{!availableZones(items,o.zones).length&&<Text style={s.small}>{flow.noZones}</Text>}{button(flow.reserve,()=>void reserve(clientCode),false,!clientCode||!canReserveBelongings(items,zone,o.zones,o.accepting))}{button(flow.back,()=>setIntakeStep(1),true)}</>}
                      </View>}
                      {task !== 'receive' && field(c.search, search, setSearch, { max: 100 })}
                      {task !== 'receive' && button(
                        c.search,
                        () => {setPickupLookup(null);void store.change({ search });},
                        true,
                      )}
                      {task !== 'receive' && !taskDeposits(task,pickupLookup ?? o.deposits).length && (
                        <Text style={s.small}>
                          {tab === "unclaimed" && o.eventEnded && !state.search
                            ? c.unclaimedEmpty
                            : c.noDeposits}
                        </Text>
                      )}
                      {taskDeposits(task,pickupLookup ?? o.deposits).map((deposit) => (
                        <Pressable
                          accessibilityRole="button"
                          key={deposit.id}
                          testID="wardrobe-record"
                          disabled={busy}
                          style={[s.card, s.row]}
                          onPress={() => {
                            store.select(deposit);
                            scroll.current?.scrollTo({ y: 0, animated: true });
                          }}
                        >
                          <Text
                            style={[
                              s.number,
                              {
                                fontSize: 24,
                                letterSpacing: -0.6,
                                maxWidth: 100,
                              },
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.4}
                          >
                            {deposit.number}
                          </Text>
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={s.bold}>
                              {deposit.customerName || c.unknown}
                            </Text>
                            <Text style={s.small}>
                              {itemsText(
                                deposit.status === "returned"
                                  ? deposit.items
                                  : deposit.remaining,
                                ro,
                              )}
                            </Text>
                            {tab === "unclaimed" ? (
                              <>
                                <Text style={s.small}>
                                  {deposit.zoneName} ·{" "}
                                  {date(deposit.storedAt ?? deposit.createdAt)}
                                </Text>
                                <Text style={s.small}>
                                  {depositedSince(deposit, ro)}
                                </Text>
                              </>
                            ) : (
                              <Text style={s.small}>
                                {date(deposit.createdAt)} · {c[deposit.status]}
                              </Text>
                            )}
                          </View>
                          <ChevronRight size={16} color="#9ca89e" />
                        </Pressable>
                      ))}
                      {task !== 'receive' && pickupLookup === null && !!o.nextCursor &&
                        button(
                          c.next,
                          () => void store.change({ cursor: o.nextCursor }),
                          true,
                        )}
                      {tab === "history" && (
                        <View style={s.card}>
                          <Text style={s.heading}>{c.audit}</Text>
                          {o.audit.map((entry) => (
                            <View key={entry.id} style={s.divider}>
                              <Text style={s.bold}>
                                {actionLabel(entry.action, ro)} ·{" "}
                                {entry.actor || c.unknown}
                              </Text>
                              <Text style={s.small}>
                                {date(entry.at)}
                                {entry.details.items
                                  ? ` · ${itemsText(entry.details.items, ro)}`
                                  : ""}
                              </Text>
                              {!!entry.details.reason && (
                                <Text style={s.small}>
                                  {entry.details.reason}
                                </Text>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                  {(task==='receive'||task==='pickup'||task==='unclaimed')&&<Text style={s.small}>{c.online}</Text>}
                  </>}
                </View>
              )}
            </>
          )}
        </View>
      </FormScrollView>
      <Modal
        visible={camera}
        animationType="slide"
        onRequestClose={() => setCamera(false)}
      >
        <View
          style={[
            s.root,
            {
              paddingTop: safe.top + 16,
              paddingBottom: safe.bottom + 20,
              paddingHorizontal: 24,
              gap: 20,
            },
          ]}
        >
          <View style={s.between}>
            <Text style={s.heading}>{c.scan}</Text>
            {button(c.close, () => setCamera(false), true)}
          </View>
          <Text style={s.small}>{task==='pickup'?flow.pickupHint:flow.scanHint}</Text>
          {!permission?.granted ? (
            button(c.permission, () => void requestPermission())
          ) : cameraError ? (
            <Text style={s.error}>{c.cameraError}</Text>
          ) : (
            camera &&
            active && (
              <View
                style={{
                  width: cameraSize,
                  height: cameraSize,
                  alignSelf: "center",
                  overflow: "hidden",
                  borderRadius: 28,
                }}
              >
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={({ data }) => void scan(data)}
                  onMountError={() => setCameraError(true)}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    width: cameraSize * 0.72,
                    height: cameraSize * 0.72,
                    top: cameraSize * 0.14,
                    left: cameraSize * 0.14,
                    borderWidth: 2,
                    borderColor: "#ff0044",
                    borderRadius: 24,
                  }}
                />
              </View>
            )
          )}
        </View>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  eventRow:{flexDirection:'row',alignItems:'center',gap:16,minHeight:92,paddingVertical:18,borderBottomWidth:1,borderColor:'#28282c'},
  eventIcon:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:'#19191c'},
  eventRowTitle:{fontSize:17,lineHeight:25,fontWeight:'600',color:'#f7faf2'},
  eventTitle:{fontSize:24,lineHeight:31,fontWeight:'700',color:'#f7faf2'},
  backEvents:{flexDirection:'row',alignItems:'center',gap:10,minHeight:44},
  otherEvents:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,minHeight:44},
  refresh:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
  refreshGlyph:{width:32,height:32,borderWidth:1,borderColor:'transparent',borderRadius:16,backgroundColor:colors.accent,alignItems:'center',justifyContent:'center'},
  syncStatusEmpty:{position:'absolute',width:1,height:1,overflow:'hidden'},
  reservationHint:{fontSize:13,lineHeight:20,color:'#f7faf2',padding:12,borderStartWidth:3,borderColor:'#ff0044',backgroundColor:'#1b1b1d'},
  root: { flex: 1, backgroundColor: "#000" },
  page: {
    width: "100%",
    maxWidth: 850,
    alignSelf: "center",
    padding: 20,
    gap: 16,
  },
  stack: { gap: 12 },
  formField: { gap: 6 },
  formLabel: { fontSize: 12, fontWeight: '600', color: '#ffffffb3' },
  formControl: { borderRadius: 8, borderColor: '#ffffff1a', backgroundColor: '#00000033', paddingHorizontal: 14 },
  formMultiline: { minHeight: 90, paddingVertical: 10 },
  secondaryAction: { borderColor: '#ff00444d', backgroundColor: '#ff00440f' },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.7,
  },
  heading: { color: "#f7faf2", fontSize: 18, fontWeight: "600" },
  text: { color: "#f7faf2", fontSize: 14 },
  bold: { color: "#f7faf2", fontSize: 13, fontWeight: "600" },
  small: { color: "#9ca89e", fontSize: 12, lineHeight: 19 },
  card: {
    padding: 20,
    gap: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ffffff1a",
    backgroundColor: "#ffffff06",
  },
  active: { borderColor: "#ff004480", backgroundColor: "#ff004414" },
  number: {
    fontSize: 48,
    fontWeight: "800",
    color: "#ff0044",
    letterSpacing: -2,
  },
  badge: {
    color: "#ff0044",
    fontSize: 10,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#ff004419",
  },
  tabs: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    borderWidth: 1,
    borderColor: "#ffffff16",
    borderRadius: 28,
    backgroundColor: "#0d0d0e",
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 8,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 24,
  },
  counter: {
    height: 36,
    width: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ffffff20",
    backgroundColor: "#18181a",
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    color: "#ff8c99",
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ff004440",
  },
  success: { color: "#34d399", fontSize: 13, lineHeight: 20 },
  qr: {
    padding: 18,
    backgroundColor: "white",
    borderRadius: 20,
    alignSelf: "center",
  },
  divider: {
    borderTopWidth: 1,
    borderColor: "#ffffff12",
    paddingTop: 16,
    gap: 8,
  },
});
