"use client";
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient } from '@packages/api-client/src/Client';
import { useDataProvider } from '@/core/DataProviderContext';
import { commissionFormula, commissionText, parseCommissionInputs, parseCommissionSettings, type CommissionSettings, type OrganizerCommission } from '@/features/admin/commissions';
import type { DirectoryDetail } from '@/features/admin/organizers';

const card = 'space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4';
const button = 'min-h-11 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold disabled:opacity-50';
const input = 'w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm outline-none focus:border-primary';
export function CommissionsPanel({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const { user, isAdmin } = useDataProvider();
  return isAdmin && user ? <Panel key={user.properties.id} initiallyOpen={initiallyOpen} /> : null;
}
function Panel({ initiallyOpen }: { initiallyOpen: boolean }) {
  const { i18n } = useTranslation(), ro = i18n.language.startsWith('ro'), t = commissionText(ro);
  const [open, setOpen] = useState(false), [data, setData] = useState<CommissionSettings>(), [search, setSearch] = useState(''), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [editing, setEditing] = useState<'standard' | OrganizerCommission | null>(null);
  const epoch = useRef(0);
  useEffect(() => () => { epoch.current++; }, []);
  const load = async () => {
    const current = ++epoch.current; setBusy(true); setFailed(false);
    try { const result = parseCommissionSettings(await ApiClient.instance.get('/admin/commissions')); if (epoch.current === current) setData(result); }
    catch { if (epoch.current === current) setFailed(true); }
    finally { if (epoch.current === current) setBusy(false); }
  };
  const editor = (target: 'standard' | OrganizerCommission) => <Editor target={target} data={data!} close={() => setEditing(null)} saved={() => { setEditing(null); void load(); }} />;
  useEffect(() => { if (initiallyOpen) { setOpen(true); void load(); } }, [initiallyOpen]);
  const rows = data?.organizers.filter(o => `${o.companyName} ${o.email}`.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  return <section className="space-y-4">
    <button disabled={!!editing} className={button + ' w-full'} onClick={() => { setOpen(!open); if (!open) void load(); }} aria-expanded={open}>{t.title}</button>
    {open && <><p className="text-sm text-muted-foreground">{t.hint}</p>
      {busy ? <p>{t.loading}</p> : failed ? <><p role="alert">{t.loadFailed}</p><button className={button} onClick={() => void load()}>{t.retry}</button></> : data && <>
        <div className={card}><h3 className="font-semibold">{t.standard}</h3><p className="text-lg font-semibold">{commissionFormula(data.standard, ro)}</p><p className="text-sm text-muted-foreground">{t.future}</p>{editing === 'standard' ? editor('standard') : <button disabled={!!editing} className={button} onClick={() => setEditing('standard')}>{t.edit}</button>}</div>
        <input aria-label={t.search} placeholder={t.search} className={input} value={search} onChange={e => setSearch(e.target.value)} disabled={!!editing} />
        {rows.map(o => <div className={card} key={o.organizerId}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{o.companyName}</h3><span className="text-xs font-semibold text-primary">{o.override ? t.negotiated : t.inherited}</span></div><p className="break-all text-sm text-muted-foreground">{o.email}</p><p className="font-semibold">{commissionFormula(o.override ?? data.standard, ro)}</p>{typeof editing === 'object' && editing?.organizerId === o.organizerId ? editor(editing) : <button disabled={!!editing} className={button} onClick={() => setEditing(o)}>{t.edit}</button>}</div>)}
        {!rows.length && <p className="text-sm text-muted-foreground">{t.empty}</p>}
      </>}
    </>}
  </section>;
}
export function OrganizerCommissionSettings({ organizer, saved }: { organizer: DirectoryDetail; saved: () => void }) {
  const { i18n } = useTranslation(), ro = i18n.language.startsWith('ro'), t = commissionText(ro), [editing,setEditing] = useState(false);
  const target: OrganizerCommission = { organizerId: organizer.userId, companyName: organizer.companyName, email: organizer.email, override: organizer.commissionOverride, revision: organizer.commissionRevision };
  return <section className={card}><h2 className="text-lg font-semibold">{t.title}</h2><p className="tabular-nums text-lg font-semibold">{commissionFormula(target.override ?? organizer.standard,ro)}</p><p className="text-sm leading-relaxed text-muted-foreground">{t.future}</p>{editing ? <Editor key={target.organizerId + ':' + target.revision} target={target} data={{standard:organizer.standard,organizers:[target]}} close={() => setEditing(false)} saved={() => { setEditing(false); saved(); }} /> : <button className={button} onClick={() => setEditing(true)}>{t.edit}</button>}</section>;
}
function Editor({ target, data, close, saved }: { target: 'standard' | OrganizerCommission; data: CommissionSettings; close: () => void; saved: () => void }) {
  const { i18n } = useTranslation(), ro = i18n.language.startsWith('ro'), t = commissionText(ro);
  const standard = target === 'standard', original = standard ? data.standard : target.override ?? data.standard;
  const [inherit, setInherit] = useState(!standard && !target.override), [rate, setRate] = useState(String(original.rateBps / 100)), [fixed, setFixed] = useState(String(original.perTicketBani / 100)), [error, setError] = useState(''), [busy, setBusy] = useState(false), lock = useRef(false), alive = useRef(true);
  const revision = useRef(standard ? data.standard.revision : target.revision).current;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const save = async () => {
    if (lock.current) return;
    const terms = parseCommissionInputs(rate, fixed);
    if (!inherit && !terms) { setError(t.invalid); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      if (standard) await ApiClient.instance.put('/admin/commissions/standard', { body: { ...terms!, revision } });
      else await ApiClient.instance.put('/admin/organizers/{id}/commission', { params: { path: { id: target.organizerId } }, body: { override: inherit ? null : terms!, revision } });
      if (alive.current) saved();
    } catch { if (alive.current) setError(t.failed); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <form className="space-y-4 rounded-xl border border-primary/40 p-4" onSubmit={e => { e.preventDefault(); void save(); }}>
    {!standard && <div className="flex flex-wrap gap-2">{[true, false].map(value => <button key={String(value)} type="button" disabled={busy} aria-pressed={inherit === value} className={button + (inherit === value ? ' border-primary bg-primary/15 text-primary' : '')} onClick={() => setInherit(value)}>{value ? t.reset : t.custom}</button>)}</div>}
    {inherit ? <p>{commissionFormula(data.standard, ro)}</p> : <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm"><span>{t.percent}</span><input className={input} inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} disabled={busy} /></label><label className="space-y-2 text-sm"><span>{t.fixed}</span><input className={input} inputMode="decimal" value={fixed} onChange={e => setFixed(e.target.value)} disabled={busy} /></label></div>}
    <p className="text-sm text-muted-foreground">{t.future}</p>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <div className="flex flex-wrap gap-2"><button disabled={busy} type="submit" className={button + ' border-primary bg-primary text-white'}>{t.save}</button><button disabled={busy} type="button" className={button} onClick={close}>{t.cancel}</button></div>
  </form>;
}
