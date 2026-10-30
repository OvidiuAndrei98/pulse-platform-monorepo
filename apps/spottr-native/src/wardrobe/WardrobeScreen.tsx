import { ActionIcon } from '../ui/ActionIcon';
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { randomUUID } from "expo-crypto";
import { ChevronRight, Shirt } from "lucide-react-native";
import { Text } from "../ui/Text";
import { FormInput } from "../ui/FormInput";
import { FormScrollView } from "../ui/KeyboardForms";
import { IconButton } from "../ui/common";
import { DashboardDropdown } from "../dashboard/DashboardDropdown";
import { usePreferences } from "../PreferencesProvider";
import { useAuth } from '../auth/AuthProvider';
import { operatorAccount, changeItemCount, taskDeposits,wardrobeFlow,wardrobeTasks,availableZones,canReserveBelongings,wardrobeEventDescription,type WardrobeTask } from '../../../pulse-app/src/features/wardrobe/flow';
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
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={{minHeight:48,paddingHorizontal:18,paddingVertical:13,borderRadius:24,backgroundColor:secondary?'#1b1b1d':'#ff0044',justifyContent:'center',opacity:disabled?.4:1}}><Text style={{color:secondary?'#f7faf2':'#000',fontSize:15,fontWeight:'600',textAlign:'center'}}>{title}</Text></Pressable>;
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
  const [task,setTask]=useState<WardrobeTask|null>(null),[intakeStep,setIntakeStep]=useState(0),[clientCode,setClientCode]=useState(''),[flowError,setFlowError]=useState(''),[advanced,setAdvanced]=useState(false),[setupTab,setSetupTab]=useState('zones');
  const ro = language === "ro",flow=wardrobeFlow(ro),
    c = wardrobeText(ro),
    overview=state.overview, o = task ? overview : undefined,
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
  const scroll = useRef<ScrollView>(null);
  const [pickupLookup,setPickupLookup]=useState<Deposit[]|null>(null),[eventFilter,setEventFilter]=useState('');
  useEffect(() => {
    setZone("");
    setTask(null);setIntakeStep(0);setClientCode('');setFlowError('');setAdvanced(false);
    setPickupLookup(null);
    setTab((current) => (current === "unclaimed" ? "unclaimed" : "operations"));
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
  const beginTask=(value:WardrobeTask)=>{if(busy||d?.status==='reserved')return;setTask(value);setTab(value==='receive'||value==='pickup'?'operations':value);setClientCode('');setIntakeStep(0);setFlowError('');setAdvanced(false);setItems({coat:0,bag:0,backpack:0});setZone('');setSearch('');void store.change({history:value==='history',unclaimed:value==='unclaimed',search:''});};
  const nextClient=()=>{store.select();setClientCode('');setIntakeStep(0);setItems({coat:0,bag:0,backpack:0});setZone('');setAdvanced(false);};
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
    <View style={s.stack}>
      <Text style={s.small}>{label}</Text>
      <FormInput
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
    <DashboardDropdown
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={c.select}
      disabled={busy}
    />
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
          <Text style={s.small}>{staff?flow.eventHint:c.hint}</Text>
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
          {button(
            state.loading ? c.loading : c.refresh,
            () => void store.refresh(staff),
            true,
            state.loading,
          )}
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
              {!state.eventId ? <View style={s.stack}><Text style={s.heading}>{flow.chooseEvent}</Text>{field(flow.eventSearch,eventFilter,setEventFilter,{max:100})}{state.events.filter(event=>event.title.toLowerCase().includes(eventFilter.toLowerCase())).map(event=><Pressable accessibilityRole="button" testID={"wardrobe-event-"+event.id} key={event.id} disabled={busy} style={s.card} onPress={()=>void store.change({eventId:event.id,history:false,unclaimed:false,search:''})}><Text style={s.heading}>{event.title}</Text><Text style={s.small}>{wardrobeEventDescription(event,ro)}</Text><Text style={s.bold}>{ro?'Deschide garderoba':'Open wardrobe'} →</Text></Pressable>)}</View> : <View style={s.card}><Text style={s.heading}>{overview?.title || state.events.find(event=>event.id===state.eventId)?.title}</Text>{button(flow.changeEvent,()=>void store.change({eventId:'',history:false,unclaimed:false,search:''}),true,d?.status==='reserved')}</View>}
              {overview && !task && <View style={s.stack}>{wardrobeTasks(overview.canManage).map(key=><Pressable accessibilityRole="button" testID={"wardrobe-task-"+key} key={key} disabled={busy} style={s.card} onPress={()=>{setPickupLookup(null);beginTask(key);}}><Text style={s.heading}>{flow[key]}</Text><Text style={s.small}>{flow[(key+'Hint') as 'receiveHint']}</Text></Pressable>)}</View>}
              {!state.loading && !state.events.length && (
                <Text style={s.small}>{c.noEvents}</Text>
              )}
              {o && (
                <>
                  {button(flow.backTasks,()=>{store.select();setTask(null);},true,d?.status==='reserved')}
                  <Text style={s.heading}>{task && flow[task]}</Text>
                  {task==='setup'&&<View style={s.row}>{button(flow.zones,()=>setSetupTab('zones'),setupTab!=='zones')}{button(flow.team,()=>setSetupTab('team'),setupTab!=='team')}</View>}
                  {task==='pickup'&&<View style={s.card}><Text style={s.small}>{flow.pickupHint}</Text>{button(c.scan,()=>{cameraGate.current=false;setCameraError(false);setCamera(true);})}{pickupLookup!==null&&button(ro?'Caută alt client':'Find another customer',()=>{setPickupLookup(null);store.select();},true)}</View>}
                  {!!flowError&&<Text accessibilityLiveRegion="assertive" style={s.error}>{flowError}</Text>}
                  <Text style={s.small}>{c.online}</Text>
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
                    <>
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
                    </>
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
                </>
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
          <Text style={s.small}>{c.scanHint}</Text>
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
  root: { flex: 1, backgroundColor: "#000" },
  page: {
    width: "100%",
    maxWidth: 850,
    alignSelf: "center",
    padding: 20,
    gap: 16,
  },
  stack: { gap: 12 },
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#ffffff16",
    backgroundColor: "#0d0d0e",
  },
  active: { borderColor: "#ff00443d", backgroundColor: "#160c11" },
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
