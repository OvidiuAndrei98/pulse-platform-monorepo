"use client";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ThemedSelect } from '@/features/events/form/ThemedSelect';
import { Building2, ArrowRight, ArrowLeft, Search } from 'lucide-react';
import { ApiClient } from '@packages/api-client/src/Client';
import { useDataProvider } from '@/core/DataProviderContext';
import { getAccessTokenSync } from '@/lib/native/sessionStorage';
import { parseDirectoryPage, parseDirectoryDetail, isOrganizerId, organizerIssues, type DirectoryDetail } from '@/features/admin/organizers';
import { OrganizerCommissionSettings } from '../CommissionsPanel';
import {Input as UIInput} from '@/components/ui/Field';

const card = 'rounded-2xl border border-white/15 bg-white/[0.025] p-5';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 px-4 py-2 text-sm font-medium outline-offset-4 hover:bg-white/5 disabled:opacity-50';
const input = "min-h-11 w-full outline-offset-4";
function useAdminLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state,setState] = useState<{data?: T; busy: boolean; failed: boolean}>({busy:true,failed:false}), [version,setVersion] = useState(0);
  useEffect(() => { const abort = new AbortController(), token = getAccessTokenSync(); let active = true; setState({busy:true,failed:false});
    void load(abort.signal).then(data => { if (active && token === getAccessTokenSync()) setState({data,busy:false,failed:false}); }, () => { if (active && token === getAccessTokenSync()) setState({busy:false,failed:true}); });
    return () => { active = false; abort.abort(); };
  },[load,version]);
  return {...state,reload: () => setVersion(value => value + 1)};
}
export function DirectoryPanel() {
  const { user,isAdmin } = useDataProvider();
  return isAdmin && user ? <Directory key={user.properties.id} /> : null;
}
function Directory() {
  const { i18n } = useTranslation(), ro = i18n.language.startsWith('ro');
  const [draft,setDraft] = useState(''), [search,setSearch] = useState(''), [status,setStatus] = useState('all'), [cursors,setCursors] = useState(['']);
  const after = cursors[cursors.length-1]!;
  const load = useCallback(async (signal: AbortSignal) => parseDirectoryPage(await ApiClient.instance.post('/admin/organizer-directory',{body:{search,status,after},signal})),[search,status,after]);
  const query = useAdminLoad(load);
  return <div className="space-y-6"><header className="space-y-3"><p className="text-xs font-semibold uppercase tracking-widest text-primary">SPOTTR Admin</p><h1 tabIndex={-1} className="text-3xl font-bold tracking-tight">{ro ? 'Organizatori' : 'Organizers'}</h1><p className="text-sm leading-relaxed text-muted-foreground">{ro ? 'Firme, verificări, conturi Stripe și setări comerciale.' : 'Companies, verification, Stripe accounts and commercial settings.'}</p></header>
    <form onSubmit={event => { event.preventDefault(); setSearch(draft.trim()); setCursors(['']); }} className={card + ' grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end'}>
      <label className="grid min-w-0 gap-2 text-sm font-medium">{ro ? 'Caută organizator' : 'Search organizers'}<UIInput className={input} name="organizer-search" maxLength={100} value={draft} onChange={event => setDraft(event.target.value)} placeholder={ro ? 'Firmă, CUI sau email' : 'Company, tax ID or email'} /></label>
      <label className="grid gap-2 text-sm font-medium">{ro ? 'Verificare' : 'Verification'}<ThemedSelect label={ro?'Verificare':'Verification'} value={status} onChange={value=>{setStatus(value);setCursors(['']);}} placeholder={ro?'Toate':'All'} options={['all','pending','approved','rejected'].map(value=>({value,label:statusLabel(value,ro)}))}/></label>
      <button className={button}><Search aria-hidden="true" className="size-4" />{ro ? 'Caută' : 'Search'}</button>
    </form>
    {query.busy ? <p role="status">{ro ? 'Se încarcă organizatorii…' : 'Loading organizers…'}</p> : query.failed ? <Failure ro={ro} retry={query.reload} /> : query.data && <>
      {!query.data.items.length ? <div className={card}><h2 className="font-semibold">{ro ? 'Niciun organizator găsit' : 'No organizers found'}</h2><button className={button + ' mt-4'} onClick={() => {setDraft('');setSearch('');setStatus('all');setCursors(['']);}}>{ro ? 'Elimină filtrele' : 'Clear filters'}</button></div> : <div className="grid gap-3">{query.data.items.map(row => <Link key={row.userId} href={'/admin/organizers/view?id=' + row.userId} className={card + ' grid min-w-0 gap-4 outline-offset-4 hover:border-primary/50 sm:grid-cols-[minmax(0,1fr)_auto]'}><div className="min-w-0 space-y-2"><h2 className="break-words text-base font-semibold">{row.companyName}</h2><p className="break-all text-sm text-muted-foreground">{row.email}</p><p className="text-xs text-muted-foreground">CUI {row.cui}</p></div><div className="flex flex-wrap items-center gap-2"><Badge>{statusLabel(row.verificationStatus,ro)}</Badge><Badge>Stripe · {stripeLabel(row.stripeStatus,ro)}</Badge><ArrowRight aria-hidden="true" className="size-4" /></div></Link>)}</div>}
      <div className="flex flex-wrap justify-between gap-3"><button className={button} disabled={cursors.length === 1} onClick={() => setCursors(values => values.slice(0,-1))}>{ro ? 'Pagina anterioară' : 'Previous page'}</button><span className="self-center text-sm tabular-nums text-muted-foreground">{ro ? 'Pagina' : 'Page'} {cursors.length}</span><button className={button} disabled={!query.data.nextCursor} onClick={() => setCursors(values => [...values,query.data!.nextCursor])}>{ro ? 'Pagina următoare' : 'Next page'}</button></div>
    </>}
  </div>;
}
export function OrganizerView() {
  const params = useSearchParams(), id = params.get('id'), { user,isAdmin } = useDataProvider(), { i18n } = useTranslation(), ro = i18n.language.startsWith('ro');
  if (!isAdmin || !user) return null;
  if (!isOrganizerId(id)) return <div className="space-y-4"><h1>{ro ? 'Organizator invalid' : 'Invalid organizer'}</h1><Link className={button} href="/admin/organizers">{ro ? 'Înapoi la organizatori' : 'Back to organizers'}</Link></div>;
  return <Detail key={user.properties.id + ':' + id} id={id} />;
}
function Detail({id}: {id:string}) {
  const { i18n } = useTranslation(), ro = i18n.language.startsWith('ro'), [tab,setTab] = useState('profile');
  const load = useCallback(async(signal:AbortSignal) => parseDirectoryDetail(await ApiClient.instance.get('/admin/organizer-directory/{id}',{params:{path:{id}},signal,cache:'no-store'})),[id]);
  const query = useAdminLoad(load), row = query.data;
  return <div className="space-y-6"><Link href="/admin/organizers" className={button}><ArrowLeft aria-hidden="true" className="size-4" />{ro ? 'Organizatori' : 'Organizers'}</Link>{query.busy ? <p role="status">{ro ? 'Se încarcă profilul…' : 'Loading profile…'}</p> : query.failed ? <Failure ro={ro} retry={query.reload} /> : row && <>
    <header className="space-y-3"><Building2 aria-hidden="true" className="size-8 text-primary" /><h1 tabIndex={-1} className="break-words text-balance text-3xl font-bold tracking-tight">{row.companyName}</h1><p className="break-all text-sm text-muted-foreground">{row.email} · @{row.username}</p><div className="flex flex-wrap gap-2"><Badge>{statusLabel(row.verificationStatus,ro)}</Badge><Badge>Stripe · {stripeLabel(row.stripeStatus,ro)}</Badge><Badge>{row.accountActive ? (ro ? 'Cont activ' : 'Active account') : (ro ? 'Cont inactiv' : 'Inactive account')}</Badge></div></header>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[[ro ? 'Evenimente' : 'Events',row.eventCount],[ro ? 'Viitoare' : 'Upcoming',row.upcomingCount],['Refund live',row.liveRefundsAttention],['Refund test',row.testRefundsAttention]].map(([label,value]) => <div className={card} key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}</div>
    <div aria-label={ro ? 'Detalii organizator' : 'Organizer details'} className="flex flex-wrap gap-2">{[['profile',ro ? 'Date firmă' : 'Company'],['events',ro ? 'Evenimente' : 'Events'],['settings',ro ? 'Setări' : 'Settings'],['issues',ro ? 'Probleme' : 'Issues']].map(([key,label]) => <button className={button + (tab === key ? ' border-primary text-primary' : '')} aria-pressed={tab === key} key={key} onClick={() => setTab(key!)}>{label}</button>)}</div>
    {tab === 'profile' && <div className={card}><dl className="grid gap-6 sm:grid-cols-2">{[[ro ? 'Denumire legală' : 'Legal company name',row.companyName],['CUI',row.cui],[ro ? 'Adresă fiscală' : 'Fiscal address',row.fiscalAddress],['Email',row.email],[ro ? 'Cont creat' : 'Account created',row.createdAt],[ro ? 'Contract acceptat' : 'Agreement accepted',row.agreementAcceptedAt],[ro ? 'Versiune contract' : 'Agreement version',row.agreementVersion],['Stripe account',row.stripeAccountId]].map(([label,value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-sm font-medium">{value || '—'}</dd></div>)}</dl><Link className={button + ' mt-6'} href="/admin/verifications">{ro ? 'Deschide verificările' : 'Open verifications'}</Link></div>}
    {tab === 'events' && <section className="space-y-3"><h2 className="text-lg font-semibold">{ro ? 'Ultimele 20 de evenimente' : 'Latest 20 events'}</h2>{row.recentEvents.map(event => <article className={card} key={event.id}><h3 className="break-words font-semibold">{event.title}</h3><p className="mt-2 text-sm text-muted-foreground">{new Intl.DateTimeFormat(ro ? 'ro-RO':'en-GB',{dateStyle:'medium',timeStyle:'short'}).format(new Date(event.startTime))} · {event.status}</p><p className="mt-2 break-words text-sm text-muted-foreground">{event.location || '—'}</p></article>)}{!row.recentEvents.length && <p>{ro ? 'Nu există evenimente pentru acest organizator.' : 'This organizer has no events.'}</p>}</section>}
    {tab === 'settings' && <OrganizerCommissionSettings key={row.userId+':'+row.commissionRevision} organizer={row} saved={query.reload} />}
    {tab === 'issues' && <Issues row={row} ro={ro} />}
  </>}</div>;
}
function Issues({row,ro}: {row:DirectoryDetail;ro:boolean}) { const issues = organizerIssues(row,ro); return <section className={card + ' space-y-4'}><h2 className="text-lg font-semibold">{ro ? 'Verificări operaționale' : 'Operational checks'}</h2>{issues.length ? <ul className="list-inside list-disc space-y-3 text-sm">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : <p className="text-sm">{ro ? 'Nu sunt semnalate probleme de cont, Stripe sau restituiri.' : 'No account, Stripe or refund issues are flagged.'}</p>}<div className="flex flex-wrap gap-2"><Link href="/admin/refunds" className={button}>{ro ? 'Deschide restituirile' : 'Open refunds'}</Link><Link href="/admin/errors" className={button}>{ro ? 'Erori globale' : 'Global errors'}</Link></div><p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{ro ? 'Erorile aplicației sunt anonime și nu sunt atribuite acestui organizator.' : 'Application errors are anonymous and are not attributed to this organizer.'}</p></section>; }
function Failure({ro,retry}: {ro:boolean;retry:()=>void}) { return <div role="alert" className={card + ' space-y-4'}><p>{ro ? 'Datele nu au putut fi încărcate. Verifică legătura cu API-ul și încearcă din nou.' : 'Unable to load data. Check the API connection and try again.'}</p><button className={button} onClick={retry}>{ro ? 'Încearcă din nou' : 'Try again'}</button></div>; }
function Badge({children}: {children:React.ReactNode}) { return <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium">{children}</span>; }
function statusLabel(value:string,ro:boolean) { const labels:Record<string,[string,string]> = {all:['Toate','All'],pending:['În verificare','Pending'],approved:['Aprobat','Approved'],rejected:['Respins','Rejected']};return labels[value]?.[ro ? 0:1] ?? value; }
function stripeLabel(value:string,ro:boolean) { const labels:Record<string,[string,string]> = {active:['Activ','Active'],attention:['De verificat','Needs attention'],onboarding:['În configurare','Onboarding'],notConnected:['Neconectat','Not connected']};return labels[value]?.[ro ? 0:1] ?? value; }
