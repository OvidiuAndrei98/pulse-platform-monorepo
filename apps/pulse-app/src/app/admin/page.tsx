"use client";
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Building2, ShieldCheck, Ban, RotateCcw, Receipt, Percent, Activity } from 'lucide-react';
import { adminSections, adminLabel, adminHref } from '@/features/admin/navigation';
const icons = [Building2,ShieldCheck,Ban,RotateCcw,Receipt,Percent,Activity];
export default function AdminPage() {
  const { i18n } = useTranslation(), ro = i18n.language.startsWith('ro');
  return <div className="space-y-8"><header className="space-y-3"><p className="text-xs font-semibold uppercase tracking-widest text-primary">SPOTTR Admin</p><h1 tabIndex={-1} className="text-balance text-3xl font-bold tracking-tight">{ro ? 'Prezentare generală' : 'Overview'}</h1><p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{ro ? 'Conturi, operațiuni financiare și starea aplicației.' : 'Accounts, financial operations and application health.'}</p></header><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{adminSections.filter(section => section !== 'overview').map((section,index) => { const Icon = icons[index]!; return <Link href={adminHref(section)} key={section} className="group flex min-h-40 flex-col justify-between gap-6 rounded-2xl border border-white/15 bg-white/[0.025] p-5 outline-offset-4 hover:border-primary/50 hover:bg-primary/5"><div className="flex items-center justify-between"><Icon aria-hidden="true" className="size-6 text-primary" /><ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground" /></div><span className="text-lg font-semibold">{adminLabel(section,ro)}</span></Link>; })}</div></div>;
}
