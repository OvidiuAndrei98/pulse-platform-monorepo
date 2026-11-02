"use client";
import { useMemo, useRef, useState } from 'react';
import { Plus, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { groupFeedItems } from '@packages/app-core/social/groupFeedItems';
import { User, type PublicProfile } from '@/core/DataProvider';
import { useDataProvider } from '@/core/DataProviderContext';
import { useCachedClientQuery } from '@/lib/useCachedClientQuery';
import { useFeedbackAction } from '@/lib/useFeedbackAction';
import { useOutings } from '@/features/outings/useOutings';
import { PlanCard } from '@/features/outings/OutingPrimitives';
import { ActionButton, ActionLink } from '@/components/ui/ActionButton';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { FriendsSheet } from '@/components/social/FriendsSheet';
import { ProfileConnectionQr } from '@/components/social/ProfileConnectionQr';
import { FeedActivityCard } from '@/components/social/FeedActivityCard';
import { SearchPopover } from '@/components/SearchPopover';
import s from './friends.module.css';

export default function FriendsHub() {
  const auth = useDataProvider();
  return <FriendsContent key={auth.user?.properties.id ?? 'guest'} />;
}
function FriendsContent() {
  const {user, loading, isOrganizer, getToken} = useDataProvider(), {t} = useTranslation(), router = useRouter();
  const social = User.useSocialFeed(user), friends = User.useFriends(isOrganizer ? undefined : user), plans = useOutings();
  const requests = useCachedClientQuery<PublicProfile[]>(user && !isOrganizer ? 'friend-requests:' + user.properties.id : null, () => user!.getFriendRequests(), []);
  const [open, setOpen] = useState(false), [responding, setResponding] = useState<string | null>(null), [visible, setVisible] = useState(6);
  const feedback = useFeedbackAction(), busy = useRef(false), current = useRef({user, getToken}); current.current = {user, getToken};
  const groups = useMemo(() => groupFeedItems(social.items.filter(item => item.activityType === 'friend_ticket' || item.activityType === 'friend_going')), [social.items]);
  const respond = async (id: string, status: 'accepted' | 'declined') => {
    if (!user || busy.current) return;
    const actor = user.properties.id, token = getToken(); busy.current = true; setResponding(id);
    await feedback.run(async () => {
      try {
        await user.respondToFriendRequest(id, status);
        if (current.current.user?.properties.id !== actor || current.current.getToken() !== token) return;
        requests.setData(rows => rows.filter(row => row.id !== id)); friends.refresh(); social.refresh(); void plans.store.load();
      } finally { busy.current = false; setResponding(null); }
    });
  };
  return <main className={s.page} data-testid="friends-hub">
    <header className={s.header}><div><h1>{t('friendsHub.title')}</h1><p>{t('friendsHub.hint')}</p></div>{user && !isOrganizer && <ActionButton tone="secondary" onClick={() => setOpen(true)} data-testid="friends-manage"><UsersRound size={18} />{t('friendsHub.manage')}{requests.data.length > 0 && <span className={s.count}>{requests.data.length}</span>}</ActionButton>}</header>
    {loading ? <StatusNotice kind="loading" title={t('common.loading')} /> : !user ? <StatusNotice title={t('friendsHub.title')} detail={t('friendsHub.guestHint')}><ActionLink href="/login?returnTo=%2Ffriends">{t('social.signIn')}</ActionLink></StatusNotice> : isOrganizer ? <StatusNotice title={t('friendsHub.title')} detail={t('friendsHub.organizer')}><ActionLink href="/feed">{t('nav.feed')}</ActionLink></StatusNotice> : <>
      <section className={s.plans} aria-labelledby="friends-plans-title">
        <div className={s.sectionHead}><div><h2 id="friends-plans-title">{t('friendsHub.plans')}</h2><p>{t('friendsHub.plansHint')}</p></div><ActionLink href="/outings?new=1"><Plus size={17} />{t('friendsHub.newPlan')}</ActionLink></div>
        {plans.pending ? <StatusNotice kind="loading" title={t('common.loading')} /> : plans.error ? <StatusNotice kind="error" title={t(plans.error)} action={() => void plans.store.load()} actionLabel={t('common.retry')} /> : plans.plans.length > 0 && <>
          {plans.plans.some(plan => plan.status === 'pending') && <p className={s.invites}>{t('friendsHub.invitations', {count: plans.plans.filter(plan => plan.status === 'pending').length})}</p>}
          <div className={s.planGrid}>{[...plans.plans].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending')).slice(0, 3).map(plan => <PlanCard key={plan.id} plan={plan} onOpen={() => router.push('/outings?plan=' + plan.id)} />)}</div><ActionLink href="/outings" tone="ghost">{t('friendsHub.allPlans')} →</ActionLink>
        </>}
      </section>
      <div className={s.connect}><ProfileConnectionQr /><div className={s.find}><span>{t('friendsHub.find')}</span><SearchPopover /></div></div>
      <section aria-labelledby="friends-events-title"><div className={s.sectionHead}><div><h2 id="friends-events-title">{t('friendsHub.events')}</h2><p>{t('friendsHub.eventsHint')}</p></div></div>
        {social.feedLoading ? <StatusNotice kind="loading" title={t('common.loading')} /> : social.feedError && !groups.length ? <StatusNotice kind="error" title={t('feedback.loadFailed')} action={social.refresh} actionLabel={t('common.retry')} /> : !groups.length ? <StatusNotice title={t('friendsHub.noEvents')} detail={t('friendsHub.noEventsHint')}><ActionLink href="/feed" tone="secondary">{t('nav.feed')}</ActionLink></StatusNotice> : <div className={s.events}>{groups.slice(0, visible).map(item => <FeedActivityCard key={item.eventId} item={item} />)}{visible < groups.length && <ActionButton tone="secondary" onClick={() => setVisible(count => count + 6)}>{t('feed.loadMore')}</ActionButton>}</div>}
      </section>
      <FriendsSheet open={open} onOpenChange={setOpen} friends={friends.friends} loading={friends.friendsLoading} error={!!friends.friendsError} onRetry={friends.refresh} requests={requests.data} requestsLoading={requests.pending} requestsError={!!requests.error} onRetryRequests={requests.retry} respondingId={responding} onRespond={respond} />
    </>}
  </main>;
}
