"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useDataProvider } from '@/core/DataProviderContext';
import { operatorAccount, wardrobeEventPhase, wardrobeEventPhaseLabel, wardrobeTabLabel, changeItemCount, taskDeposits,wardrobeFlow,wardrobeTasks,availableZones,canReserveBelongings,wardrobeEventDescription,type WardrobeTask } from './flow';
import { Shirt, ArrowLeft, CalendarDays, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";
import { TicketQrCode } from "@/components/tickets/TicketQrCode";
import { WardrobeTabs } from "./WardrobeTabs";
import { ThemedSelect } from '@/features/events/form/ThemedSelect';
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
} from "./model";
import s from "./wardrobe.module.css";
import {Input as UIInput,TextArea as UITextArea} from '@/components/ui/Field';
import {ActionButton,ActionLink} from '@/components/ui/ActionButton';

export function WardrobeCard() {
  const { state, user } = useWardrobe(false, 20000),
    { i18n } = useTranslation(),
    c = wardrobeText(i18n.language.startsWith("ro"));
  if (
    !user ||
    (!operatorAccount(user.properties.role) && (!state.mine || (!state.mine.deposits.length && !state.mine.staffAccess)))
  )
    return null;
  const deposit = operatorAccount(user.properties.role) ? undefined : state.mine?.deposits[0];
  return (
    <Link href="/wardrobe" className={s.banner} data-testid="wardrobe-card">
      <Shirt size={24} color="#ff0044" />
      <div>
        <strong>{deposit ? c.active : c.staff}</strong>
        <p>
          {deposit
            ? `${deposit.eventTitle} · ${deposit.number}${(state.mine?.deposits.length ?? 0) > 1 ? ` +${state.mine!.deposits.length - 1}` : ""}`
            : c.open}
        </p>
      </div>
      <ChevronRight size={18} />
    </Link>
  );
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
    <div>
      {itemKeys.map((key) => (
        <div key={key} className={s.counter}>
          <span>{c[key]}</span>
          <button
            type="button"
            aria-label={`− ${c[key]}`}
            disabled={disabled || value[key] <= 0}
            onClick={() => onChange(current=>changeItemCount(current,key,-1,max))}
          >
            −
          </button>
          <b>{value[key]}</b>
          <button
            type="button"
            aria-label={`+ ${c[key]}`}
            disabled={
              disabled ||
              totalItems(value) >= 20 ||
              value[key] >= (max?.[key] ?? 20)
            }
            onClick={() => onChange(current=>changeItemCount(current,key,1,max))}
          >
            +
          </button>
        </div>
      ))}
    </div>
  );
}
export function WardrobePage({
  initialStaff = false,
}: {
  initialStaff?: boolean;
}) {
  const { isOrganizer,isAdmin } = useDataProvider(), operatorOnly=isOrganizer||isAdmin;
  const [staffChoice, setStaff] = useState(initialStaff), staff=operatorOnly||staffChoice;
  const { store, state, user } = useWardrobe(staff),
    { i18n } = useTranslation(),
    router = useRouter();
  const [task,setTask]=useState<WardrobeTask>('receive'),[intakeStep,setIntakeStep]=useState(0),[clientCode,setClientCode]=useState(''),[flowError,setFlowError]=useState(''),[advanced,setAdvanced]=useState(false),[setupTab,setSetupTab]=useState('zones');
  const ro = i18n.language.startsWith("ro"), flow=wardrobeFlow(ro),
    c = wardrobeText(ro),
    overview=state.overview, o = overview,
    canManage=overview?.canManage ?? state.events.find(event=>event.id===state.eventId)?.canManage ?? false,
    d = state.selected;
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
    [search, setSearch] = useState(""),
    [reason, setReason] = useState(""),
    [recovery, setRecovery] = useState(false);
  const [name, setName] = useState(""),
    [prefix, setPrefix] = useState("A"),
    [capacity, setCapacity] = useState("100"),
    [kind, setKind] = useState("any"),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("operator");
  const busy = state.busy;
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
  useEffect(() => {
    if (!camera) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCamera(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [camera]);
  const act = (action: Command["action"], extra: Partial<Command> = {}) =>
    d &&
    void store.command({
      action,
      depositId: d.id,
      revision: d.revision,
      ...extra,
    });
  const reserve = (code: string, additional = false) =>
    store.reserve(code, zone, items, additional, () => crypto.randomUUID());
  const scan = async (code: string) => {
    if (cameraGate.current) return;
    cameraGate.current = true;
    setCamera(false);
    if(task==='pickup'){setPickupLookup([]);store.select();}else setClientCode('');
    const customer=readProfileQR(code); if (!customer) {setFlowError(flow.badCode);return;}
    setFlowError('');
    if(task==='pickup') {const result=await store.command({action:'lookup',code:'glow://friend/'+customer});if(result){const rows=(result.deposits??[]).filter(row=>row.status==='stored');setPickupLookup(rows);const current=store.snapshot().selected;store.select(rows.length===1?(current?.id===rows[0]!.id?current:rows[0]):undefined);}}
    else {setClientCode('glow://friend/'+customer);setIntakeStep(1);}
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
    const heading=document.getElementById(state.eventId?'wardrobe-event-heading':'wardrobe-events-heading');heading?.setAttribute('tabindex','-1');if(heading)heading.style.outline='none';heading?.focus({preventScroll:true});
  },[state.eventId,staff,user?.properties.id]);
  const eventRow=(event:WardrobeEvent)=><button type="button" key={event.id} data-testid={'wardrobe-event-'+event.id} className={s.eventRow} disabled={busy} onClick={()=>enterEvent(event.id)}><span className={s.eventIcon}><CalendarDays aria-hidden="true" size={22}/></span><span className={s.eventRowCopy}><strong>{event.title}</strong><span>{wardrobeEventDescription(event,ro)}</span>{wardrobeEventPhase(event)!=='other'&&<span>{wardrobeEventPhaseLabel(event,ro)}</span>}</span><ChevronRight aria-hidden="true" size={19}/></button>;

  const refreshControl = (
    <button type="button" className={s.refresh} aria-label={c.refresh}
      disabled={state.loading || busy} onClick={() => void store.refresh(staff)}>
      <span className={s.refreshGlyph} aria-hidden="true"><RefreshCw size={16} /></span>
    </button>
  );
  const button = (
    label: string,
    onClick: () => void,
    secondary = false,
    disabled = false,
  ) => (
    <ActionButton
      tone={secondary?"secondary":"primary"}
      className={s.button}
      onClick={onClick}
      disabled={busy || disabled}
    >
      {label}
    </ActionButton>
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
      <main className={s.page}>
        <ActionLink href="/login" className={s.button}>
          {ro ? "Conectează-te" : "Sign in"}
        </ActionLink>
      </main>
    );
  return (
    <main className={`${s.page} ${s.stack}`} data-testid="wardrobe-page">
      <div className={s.row}>
        <button
          type="button"
          aria-label={c.back}
          onClick={() =>
            window.history.length > 1 ? router.back() : router.push("/users/me")
          }
        >
          <ArrowLeft size={24} />
        </button>
        <Shirt color="#ff0044" />
        <h1>{c.title}</h1>
      </div>
      {!staff&&<p>{c.hint}</p>}
      {!operatorOnly && (state.mine?.staffAccess || initialStaff) && (
        <div className={s.tabs}>
          {button(c.mine, () => setStaff(false), staff)}
          {button(c.staff, () => setStaff(true), !staff)}
        </div>
      )}
      {!!state.error && (
        <p role="alert" className={s.error}>
          {wardrobeError(state.error, ro)}
        </p>
      )}
      <p role="status" className={state.syncError&&!state.error?s.small:s.syncStatusEmpty}>{state.syncError&&!state.error?c.syncPaused:''}</p>
      {!staff&&<div className={s.refreshRow}>{refreshControl}</div>}
      {!staff ? (
        <>
          {state.mine?.deposits.length === 0 && (
            <div className={s.card}>
              <h2>{c.empty}</h2>
              <p>{c.emptyHint}</p>
            </div>
          )}
          {state.mine?.deposits.map((deposit) => (
            <div
              key={deposit.id}
              className={`${s.card} ${s.active}`}
              data-testid="wardrobe-deposit"
            >
              <div className={s.between}>
                <h2>{deposit.eventTitle}</h2>
                <span className={s.badge}>{c[deposit.status]}</span>
              </div>
              <strong className={s.number}>{deposit.number}</strong>
              <p>
                {deposit.zoneName} · {itemsText(deposit.remaining, ro)}
              </p>
              <p>{date(deposit.createdAt)}</p>
              {pickupActive(deposit) && (
                <div className={s.stack}>
                  <h2>{itemsText(deposit.pickupItems!, ro)}</h2>
                  <p>{deposit.pickupApproved ? c.confirmed : c.confirmHint}</p>
                  {!deposit.pickupApproved &&
                    button(c.approve, () => void store.approve(deposit, true))}
                  {button(
                    c.decline,
                    () => void store.approve(deposit, false),
                    true,
                  )}
                </div>
              )}
            </div>
          ))}
          <div className={s.card}>
            <h2>{c.code}</h2>
            <div className={s.qr}>
              <TicketQrCode
                value={`glow://friend/${user.properties.id}`}
                size={360}
                alt={c.code}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          {!state.eventId?<>
            <div className={s.between}><h2 id="wardrobe-events-heading">{ro?'Evenimente active':'Active events'}</h2>{refreshControl}</div>
            <p>{ro?'Alege evenimentul pentru primire, predare și gestionarea garderobei.':'Choose an event to receive, return and manage belongings.'}</p>
            {state.loading&&!state.events.length&&<p role="status">{c.loading}</p>}
            <div>{activeEvents.map(eventRow)}</div>
            {!state.loading&&!activeEvents.length&&<p>{!state.events.length?c.noEvents:ro?'Nu ai evenimente active. Evenimentele încheiate și ciornele sunt disponibile mai jos.':'No active events. Past events and drafts are available below.'}</p>}
            {!!otherEvents.length&&<><button type="button" className={s.otherEvents} aria-expanded={otherVisible} aria-controls={otherVisible?"wardrobe-other-events":undefined} onClick={()=>setShowOther(!otherVisible)}>{ro?'Alte evenimente':'Other events'} ({otherEvents.length}){otherVisible?<ChevronDown aria-hidden="true" size={18}/>:<ChevronRight aria-hidden="true" size={18}/>}</button>{otherVisible&&<div id="wardrobe-other-events">{otherEvents.map(eventRow)}</div>}</>}
          </>:<>
            <div className={s.between}><button type="button" data-testid="wardrobe-back-events" className={s.backEvents} disabled={busy||d?.status==='reserved'} onClick={leaveEvent}><ArrowLeft aria-hidden="true" size={18}/>{ro?'Înapoi la evenimente':'Back to events'}</button>{refreshControl}</div>
            <h2 id="wardrobe-event-heading" className={s.eventTitle}>{overview?.title||state.events.find(event=>event.id===state.eventId)?.title}</h2>
            <p className={s.eventMeta}>{wardrobeEventDescription(state.events.find(event=>event.id===state.eventId)??{id:state.eventId,title:'',canManage},ro)}</p>
            <WardrobeTabs id="wardrobe-operations" label={flow.operations} value={task} options={wardrobeTasks(canManage).map(value=>({value,label:wardrobeTabLabel(value,ro)}))} onChange={beginTask} disabled={busy} locked={d?.status==='reserved'} panelId="wardrobe-panel" ro={ro}/>
            {d?.status==='reserved'&&<p role="status" className={s.reservationHint}>{flow.reservationHint}</p>}
          </>}
          {state.eventId && (
            <section role="tabpanel" id="wardrobe-panel" aria-labelledby={'wardrobe-operations-'+task} className={s.panel}>
              {!o&&<p role="status">{c.loading}</p>}
              {o&&<>


              {task==='setup'&&<WardrobeTabs id="wardrobe-settings" label={flow.settings} value={setupTab} options={[{value:'zones',label:ro?'Zone și obiecte':'Zones and items'},{value:'team',label:flow.team}]} onChange={setSetupTab} disabled={busy} panelId="wardrobe-settings-panel" ro={ro}/>}
              {task==='pickup'&&<div className={s.card}><p>{flow.pickupHint}</p>{button(c.scan,()=>{cameraGate.current=false;setCamera(true);})}{pickupLookup!==null&&button(ro?'Caută alt client':'Find another customer',()=>{setPickupLookup(null);store.select();},true)}</div>}
              {!!flowError&&<p role="alert" className={s.error}>{flowError}</p>}

              {tab === "history" && (
                <p className={s.small}>{c.retentionHint}</p>
              )}
              {tab === "unclaimed" && (
                <div
                  className={`${s.card} ${s.active}`}
                  data-testid="wardrobe-unclaimed-summary"
                >
                  <h2>
                    {c.unclaimedSummary(o.unclaimedCount, o.unclaimedItems)}
                  </h2>
                  <p>{o.eventEnded ? c.unclaimedHint : c.unclaimedPending}</p>
                </div>
              )}
              {tab === "setup" && o.canManage ? (
                <section id="wardrobe-settings-panel" role="tabpanel" aria-labelledby={'wardrobe-settings-'+setupTab} className={s.stack}>
                  <div className={s.card} style={setupTab!=='zones'?{display:'none'}:undefined}>
                    <h2>{c.zone}</h2>
                    <p>{c.zonesHint}</p>
                    {o.zones.map((z) => (
                      <div className={s.stack} key={z.id}>
                        <div className={s.between}>
                          <b>
                            {z.name} · {z.prefix}001–{z.prefix}
                            {String(z.capacity).padStart(3, "0")}
                          </b>
                          <span>
                            {z.capacity - z.occupied} {c.free}
                          </span>
                        </div>
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
                      </div>
                    ))}
                    <label className={s.field}>
                      {c.zoneName}
                      <UIInput
                        value={name}
                        maxLength={60}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <div className={s.row}>
                      <label className={s.field}>
                        {c.prefix}
                        <UIInput
                          value={prefix}
                          maxLength={8}
                          onChange={(e) =>
                            setPrefix(e.target.value.toUpperCase())
                          }
                        />
                      </label>
                      <label className={s.field}>
                        {c.capacity}
                        <UIInput
                          type="number"
                          min={1}
                          max={2000}
                          value={capacity}
                          onChange={(e) => setCapacity(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className={s.field}>
                      <span>{c.kind}</span>
                      <ThemedSelect label={c.kind} testId="wardrobe-kind" name="wardrobe-kind" value={kind} onChange={setKind} placeholder={c.select} disabled={busy} options={(['any','coat','bag'] as const).map(value=>({value,label:c[value]}))}/>
                    </div>
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
                  </div>
                  <div className={s.card} style={setupTab!=='team'?{display:'none'}:undefined}>
                    <h2>{c.team}</h2>
                    {o.staff.map((member) => (
                      <div className={s.between} key={member.id}>
                        <div>
                          <b>{member.name}</b>
                          <p>{c[member.role]}</p>
                        </div>
                        {button(
                          c.remove,
                          () =>
                            void store.command({
                              action: "remove-staff",
                              userId: member.id,
                            }),
                          true,
                        )}
                      </div>
                    ))}
                    <label className={s.field}>
                      {c.email}
                      <UIInput
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <div className={s.field}>
                      <span>{c.team}</span>
                      <ThemedSelect label={c.team} name="wardrobe-role" value={role} onChange={setRole} placeholder={c.select} disabled={busy} options={[{value:'operator',label:c.operator},{value:'supervisor',label:c.supervisor}]}/>
                    </div>
                    {button(
                      c.addStaff,
                      () =>
                        void store.command({ action: "staff", email, role }),
                      false,
                      !email.includes("@"),
                    )}
                  </div>
                </section>
              ) : (
                <>
                  {task === 'receive' && !d && <section className={s.card} data-testid="wardrobe-intake">
                    <p>{[flow.scanClient,flow.items,flow.place][intakeStep]}</p>
                    {!o.accepting && <p>{c.closed}</p>}
                    {intakeStep===0&&<><p>{flow.scanHint}</p>{button(c.scan,()=>{cameraGate.current=false;setCamera(true);},false,!o.accepting)}</>}
                    {intakeStep===1&&<><p>{flow.scanned}</p><Counters value={items} onChange={setItems} disabled={busy} ro={ro}/>{button(flow.next,()=>{setZone('');setIntakeStep(2);},false,!totalItems(items))}{button(flow.back,()=>setIntakeStep(0),true)}</>}
                    {intakeStep===2&&<><p>{itemsText(items,ro)}</p><div className={s.field}><span>{c.zone}</span><ThemedSelect label={c.zone} name="wardrobe-zone" value={zone} disabled={busy} onChange={setZone} placeholder={c.select} options={availableZones(items,o.zones).map(z=>({value:z.id,label:`${z.name} · ${z.capacity-z.occupied} ${c.free}`}))}/></div>{!availableZones(items,o.zones).length&&<p>{flow.noZones}</p>}{button(flow.reserve,()=>void reserve(clientCode),false,!clientCode||!canReserveBelongings(items,zone,o.zones,o.accepting))}{button(flow.back,()=>setIntakeStep(1),true)}</>}
                  </section>}
                  {d && (
                    <div
                      className={`${s.card} ${s.active}`}
                      data-testid="wardrobe-selected"
                    >
                      <div className={s.between}>
                        <h2>{d.customerName || c.unknown}</h2>
{button(c.close, () => store.select(), true, d.status==='reserved')}
                      </div>
                      <strong className={s.number}>{d.number}</strong>
                      <span>
                        {d.zoneName} · {c[d.status]}
                      </span>
                      <p>{itemsText(d.remaining, ro)}</p>
                      {d.status === "reserved" && task === "receive" && (
                        <>
                          <p>{c.storeHint}</p>
                          {button(c.store, () => act("store"))}
                          {button(c.cancel, () => act("cancel"), true)}
                        </>
                      )}
                      {d.status === "stored" && (task === "pickup" || task === "unclaimed") && (
                        <>
                          <p>{c.pickupHint}</p>
                          <Counters
                            value={pickupItems}
                            onChange={setPickupItems}
                            max={d.remaining}
                            disabled={busy || (pickupActive(d) && !recovery)}
                            ro={ro}
                          />
                          {pickupActive(d) ? (
                            <>
                              <p
                                className={
                                  d.pickupApproved ? s.success : undefined
                                }
                              >
                                {d.pickupApproved ? c.approved : c.waiting}
                              </p>
                              <p>{itemsText(d.pickupItems!, ro)}</p>
                              {d.pickupApproved &&
                                button(c.handover, () =>
                                  act("return", { pickupId: d.pickupId! }),
                                )}
                            </>
                          ) : (
                            button(
                              c.pickup,
                              () =>
                                act("request-pickup", { items: pickupItems }),
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
                            <div className={s.stack}>
                              <p>{c.recoveryHint}</p>
                              <label className={s.field}>
                                {c.reason}
                                <UITextArea
                                  value={reason}
                                  maxLength={300}
                                  onChange={(e) => setReason(e.target.value)}
                                />
                              </label>
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
                            </div>
                          )}
                        </>
                      )}
                      {d.status !== 'reserved' && task === 'receive' && button(flow.nextClient,nextClient)}
                      {['reserved','stored'].includes(d.status) && (task==='receive'||task==='pickup'||task==='unclaimed') && button(flow.advanced,()=>setAdvanced(!advanced),true)}
                      {advanced && (d.status === "reserved" || d.status === "stored") && (
                        <>
                          <p>{c.moveHint}</p>
                          <div className={s.field}>
                            <span>{c.zone}</span>
                            <ThemedSelect label={c.zone} name="wardrobe-move-zone" value={moveZone} disabled={busy} onChange={setMoveZone} placeholder={c.select} options={availableZones(d.remaining,o.zones).filter(z=>z.id!==d.zoneId).map(z=>({value:z.id,label:`${z.name} · ${z.capacity-z.occupied} ${c.free}`}))}/>
                          </div>
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
                            <div className={s.stack}>
                              <p>{c.addHint}</p>
                              <div className={s.field}>
                                <span>{c.zone}</span>
                                <ThemedSelect label={c.zone} name="wardrobe-add-zone" value={zone} disabled={busy} onChange={setZone} placeholder={c.select} options={availableZones(items,o.zones).map(z=>({value:z.id,label:`${z.name} · ${z.capacity-z.occupied} ${c.free}`}))}/>
                              </div>
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
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  <div className={`${s.row} ${s.searchRow}`} style={task==='receive'?{display:'none'}:undefined}>
                    <label className={s.field}>
                      {c.search}
                      <UIInput
                        value={search}
                        maxLength={100}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {setPickupLookup(null);void store.change({ search });}
                        }}
                      />
                    </label>
                    {button(
                      c.search,
() => {setPickupLookup(null);void store.change({ search });},
                      true,
                    )}
                  </div>
                  {task !== 'receive' && !taskDeposits(task,pickupLookup ?? o.deposits).length && (
                    <p>
                      {tab === "unclaimed" && o.eventEnded && !state.search
                        ? c.unclaimedEmpty
                        : c.noDeposits}
                    </p>
                  )}
                  {taskDeposits(task,pickupLookup ?? o.deposits).map((deposit) => (
                    <button
                      type="button"
                      className={s.entry}
                      key={deposit.id}
                      data-testid="wardrobe-record"
                      onClick={() => store.select(deposit)}
                      disabled={busy}
                    >
                      <strong>{deposit.number}</strong>
                      <div>
                        <b>{deposit.customerName || c.unknown}</b>
                        <p>
                          {itemsText(
                            deposit.status === "returned"
                              ? deposit.items
                              : deposit.remaining,
                            ro,
                          )}
                        </p>
                        {tab === "unclaimed" ? (
                          <>
                            <p>{deposit.zoneName}</p>
                            <small>
                              {date(deposit.storedAt ?? deposit.createdAt)} ·{" "}
                              {depositedSince(deposit, ro)}
                            </small>
                          </>
                        ) : (
                          <small>{date(deposit.createdAt)}</small>
                        )}
                      </div>
                      {tab === "unclaimed" ? (
                        <ChevronRight
                          size={16}
                          className={s.small}
                          style={{ flexShrink: 0 }}
                        />
                      ) : (
                        <span className={s.badge}>{c[deposit.status]}</span>
                      )}
                    </button>
                  ))}
                  {task !== 'receive' && pickupLookup === null && o.nextCursor &&
                    button(
                      c.next,
                      () => void store.change({ cursor: o.nextCursor }),
                      true,
                    )}
                  {tab === "history" && (
                    <div className={s.card}>
                      <h2>{c.audit}</h2>
                      {o.audit.map((entry) => (
                        <div key={entry.id} className={s.divider}>
                          <b>
                            {actionLabel(entry.action, ro)} ·{" "}
                            {entry.actor || c.unknown}
                          </b>
                          <p>
                            {date(entry.at)}
                            {entry.details.items
                              ? ` · ${itemsText(entry.details.items, ro)}`
                              : ""}
                          </p>
                          {entry.details.reason && (
                            <p>{entry.details.reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {(task==='receive'||task==='pickup'||task==='unclaimed')&&<p className={s.small}>{c.online}</p>}
              </>}
            </section>
          )}
        </>
      )}
      {camera && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={c.scan}
          className={s.camera}
        >
          <div className={s.stack}>
            {button(c.close, () => setCamera(false), true)}
            <QrCameraScanner embedded enabled onScan={scan} hint={task==='pickup'?flow.pickupHint:flow.scanHint} />
          </div>
        </div>
      )}
    </main>
  );
}
