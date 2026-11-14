"use client";
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { UsersRound } from 'lucide-react';
import {EventFriendTickets} from '@/features/groups/EventFriendTickets';
export function SuggestOutingLink({eventId,onNavigate}:{eventId:string;onNavigate?:()=>void}) {
  const {t}=useTranslation();
  return <div className="flex flex-wrap items-center gap-3"><Link data-testid="event-outing" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
    href={'/groups?event='+eventId} onClick={onNavigate}><UsersRound size={18}/>{t('groups.sendTo')}</Link><EventFriendTickets eventId={eventId}/></div>;
}
