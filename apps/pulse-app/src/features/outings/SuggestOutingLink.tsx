"use client";
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
export function SuggestOutingLink({eventId,onNavigate}:{eventId:string;onNavigate?:()=>void}) {
  const {t}=useTranslation();
  return <Link data-testid="event-outing" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4"
    href={'/outings?event='+eventId} onClick={onNavigate}>{t('outings.addToPlan')}</Link>;
}
