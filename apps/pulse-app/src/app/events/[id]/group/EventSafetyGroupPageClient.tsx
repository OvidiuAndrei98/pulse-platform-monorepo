"use client";
import {useParams,useSearchParams} from 'next/navigation';
import {ArrowLeft} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {ActionLink} from '@/components/ui/ActionButton';
import {StatusNotice} from '@/components/ui/StatusNotice';
import {isOutingId} from '@packages/app-core/outings/model';
/** Old links are a controlled retirement destination. Never read/create an
 * event conversation and never redirect into an arbitrary private group. */
export default function EventSafetyGroupPageClient(){
 const {t}=useTranslation(),params=useParams<{id:string}>(),search=useSearchParams(),id=params.id==='mobile'?search.get('groupEventId'):params.id;
 return <main className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-8"><ActionLink tone="secondary" className="!h-11 !w-11 !p-0" href={isOutingId(id)?'/events/'+id:'/friends'} aria-label={t('common.back')}><ArrowLeft size={20}/></ActionLink><StatusNotice title={t('groups.retired')} detail={t('groups.retiredHint')}/><ActionLink href="/friends">{t('groups.title')}</ActionLink></main>;
}
