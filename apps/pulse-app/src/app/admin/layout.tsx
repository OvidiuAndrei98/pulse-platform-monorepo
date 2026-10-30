"use client";
import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { useDataProvider } from '@/core/DataProviderContext';
import { adminSections, adminLabel, adminHref, adminSection } from '@/features/admin/navigation';
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useDataProvider(), { i18n } = useTranslation(), path = usePathname(), ro = i18n.language.startsWith('ro');
  const selected = adminSection(path.split('/')[2]);
  useEffect(() => { document.title = adminLabel(selected,ro) + ' · SPOTTR Admin'; if(loading||!isAdmin||!user)return; const target=document.querySelector<HTMLElement>('#admin-content h1') || document.querySelector<HTMLElement>('#admin-content'); target?.setAttribute('tabindex','-1'); target?.focus({preventScroll:true}); document.querySelector('details[data-admin-menu]')?.removeAttribute('open'); }, [path,selected,ro,loading,isAdmin,user?.properties.id]);
  if (loading) return <main className="app-page-spacing" role="status">{ro ? 'Se verifică accesul…' : 'Checking access…'}</main>;
  if (!isAdmin || !user) return <main className="app-page-spacing space-y-4"><h1>{ro ? 'Acces rezervat administratorilor' : 'Administrator access required'}</h1><Link href="/">{ro ? 'Înapoi la evenimente' : 'Back to events'}</Link></main>;
  const menu = <nav aria-label={ro ? 'Secțiuni administrare' : 'Administration sections'} className="grid gap-1">{adminSections.map(section => <Link key={section} href={adminHref(section)} aria-current={selected === section ? 'page' : undefined}
    className={'min-h-11 rounded-xl px-4 py-3 text-sm font-medium outline-offset-4 transition-colors ' + (selected === section ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground')}>{adminLabel(section,ro)}</Link>)}</nav>;
  return <div key={user.properties.id} className="mx-auto grid min-h-dvh max-w-[1500px] gap-8 px-4 py-6 text-foreground sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10 lg:px-10">
    <a href="#admin-content" className="fixed left-4 top-4 z-50 -translate-y-32 rounded-lg bg-background p-3 shadow-lg focus:translate-y-0">{ro ? 'Sari la conținut' : 'Skip to content'}</a>
    <aside className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-1"><Link href="/admin" className="flex min-h-11 items-center gap-3 text-sm font-semibold"><ShieldCheck aria-hidden="true" className="size-5 text-primary" /><span>SPOTTR <span className="text-muted-foreground">Admin</span></span></Link><div className="hidden lg:block">{menu}</div><details data-admin-menu className="rounded-xl border border-white/15 lg:hidden"><summary className="cursor-pointer p-4 font-medium">{adminLabel(selected,ro)} · {ro ? 'Meniu' : 'Menu'}</summary><div className="p-2">{menu}</div></details><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground underline underline-offset-4">{ro ? 'Deschide platforma' : 'Open platform'}<ArrowUpRight aria-hidden="true" className="size-4" /></Link></aside>
    <main id="admin-content" tabIndex={-1} className="min-w-0 pb-20 outline-none [&_h1]:outline-none lg:col-start-2 lg:row-start-1">{children}</main>
  </div>;
}
