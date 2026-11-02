"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Heart, MapPin, Share2, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { feedDate, feedMoney, type FeedEvent } from '@packages/app-core/feed/model';
import { ActionButton, ActionLink, IconButton } from '@/components/ui/ActionButton';
import { StatusNotice } from '@/components/ui/StatusNotice';
import { useEventDetails } from '@/components/EventDetailsSheet';
import { User } from '@/core/DataProvider';
import { useEventFeed } from './useEventFeed';
import s from './feed.module.css';

function Poster({event}: {event: FeedEvent}) {
  const [failed, setFailed] = useState(false), src = failed || !event.bannerUrl ? '/party-event.webp' : event.bannerUrl;
  return <div className={s.poster} aria-hidden="true"><img className={s.backdrop} src={src} alt="" loading="lazy" onError={() => setFailed(true)} /><img className={s.photo} src={src} alt="" loading="lazy" onError={() => setFailed(true)} /></div>;
}
export default function EventFeed() {
  const model = useEventFeed(), {t, i18n} = useTranslation(), router = useRouter(), details = useEventDetails();
  const viewport = useRef<HTMLDivElement>(null), [active, setActive] = useState(0), [opening, setOpening] = useState<string>();
  const openLock = useRef(false), owner = useRef(model.actor); owner.current = model.actor;
  useEffect(() => { setActive(0); viewport.current?.scrollTo({top: 0}); }, [model.store]);
  useEffect(() => {
    const root = viewport.current;
    if (!root || !model.items.length) return;
    const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index)); }, {root, threshold: .65});
    root.querySelectorAll('[data-index]').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [model.items.length]);
  const count = model.items.length;
  useEffect(() => { if (active >= count - 2 && count > 0 && model.nextPage && !model.error) void model.store.load(true); }, [active, count, model.nextPage, model.error, model.store]);
  const move = (index: number) => viewport.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({block: 'start', behavior: 'auto'});
  const open = async (event: FeedEvent) => {
    if (openLock.current) return;
    openLock.current = true; setOpening(event.id); const actor = model.actor;
    try { const full = await User.getPublicEventById(event.id); if (owner.current === actor) details.open(full); }
    catch { if (owner.current === actor) toast.error(t('feedback.loadFailed')); }
    finally { openLock.current = false; setOpening(undefined); }
  };
  const like = (event: FeedEvent) => model.actor ? void model.store.setLike(event.id, !event.liked) : router.push('/login?returnTo=%2Ffeed');
  const share = async (event: FeedEvent) => {
    const url = new URL('/events/' + event.id, window.location.origin).href;
    try { if (navigator.share) await navigator.share({title: event.title, url}); else { await navigator.clipboard.writeText(url); toast.success(t('discovery.copied')); } }
    catch (cause) { if ((cause as Error)?.name !== 'AbortError') toast.error(t('feedback.shareFailed')); }
  };
  return <main className={s.page} data-testid="event-feed">
    <header className={s.header}><div><h1>{t('discovery.title')}</h1><p>{t('discovery.hint')}</p></div><span className={s.swipe}>{t('discovery.swipe')}</span></header>
    {!model.ready || model.pending ? <div className={s.center} role="status">{t('common.loading')}</div> : !count ? <div className={s.center}>
      {model.error ? <StatusNotice kind="error" title={t('feedback.loadFailed')} action={() => void model.store.load()} actionLabel={t('common.retry')} /> : <><h2>{t('discovery.empty')}</h2><p>{t('discovery.emptyHint')}</p><ActionLink href="/events" tone="secondary">{t('nav.map')}</ActionLink></>}
    </div> : <>
      <div ref={viewport} className={s.viewport} data-nav-scroll={'event-feed:' + (model.actor ?? 'guest')} aria-label={t('discovery.title')} tabIndex={0}
        onKeyDown={e => { if (e.target === e.currentTarget && ['ArrowDown','ArrowUp'].includes(e.key)) { e.preventDefault(); move(Math.max(0, Math.min(count - 1, active + (e.key === 'ArrowDown' ? 1 : -1)))); } }}>
        {model.items.map((event, index) => <article className={s.slide} key={event.id} data-index={index} aria-label={event.title}>
          {Math.abs(index - active) <= 1 && <Poster event={event} />}
          <div className={s.shade} />
          <div className={s.content}><div className={s.details}><span className={s.category}>{event.category}</span><h2>{event.title}</h2>
            <p><CalendarDays size={17} aria-hidden />{feedDate(event, i18n.language)}</p><p><MapPin size={17} aria-hidden />{event.locationName}{event.city ? ' · ' + event.city : ''}</p>
            <span className={s.price}>{event.externalTickets ? t('discovery.external') : event.priceRon === 0 ? t('discovery.free') : event.priceRon !== undefined ? t('discovery.from', {price: feedMoney(event.priceRon, i18n.language)}) : ''}</span>
            <ActionButton data-testid={'feed-open-' + event.id} busy={opening === event.id} onClick={() => void open(event)}>{t('discovery.view')}</ActionButton>
          </div><div className={s.actions}>
            <div className={s.like}><IconButton label={t(event.liked ? 'discovery.unlike' : 'discovery.like', {event: event.title})} tone="secondary" aria-pressed={event.liked} disabled={model.working.includes(event.id)} data-testid={'feed-like-' + event.id} onClick={() => like(event)}><Heart size={25} fill={event.liked ? 'currentColor' : 'none'} className={event.liked ? s.liked : ''} /></IconButton><span aria-label={t('discovery.likes', {count: event.likeCount})} title={t('discovery.publicLikes')} aria-live="polite">{event.likeCount}</span></div>
            <IconButton label={t('discovery.share')} tone="secondary" onClick={() => void share(event)}><Share2 size={22} /></IconButton>
            <ActionLink href={'/outings?event=' + event.id} tone="secondary" className={s.propose} aria-label={t('discovery.propose')}><UsersRound size={23} /></ActionLink>
          </div></div>
          {model.likeErrors.includes(event.id) && <p className={s.likeError} role="alert">{t('discovery.likeFailed')}</p>}
          {index === count - 1 && <div className={s.more}>{model.loadingMore ? <span role="status">{t('common.loading')}</span> : model.error ? <ActionButton tone="secondary" onClick={() => void model.store.load(true)}>{t('common.retry')}</ActionButton> : model.nextPage ? <ActionButton tone="secondary" onClick={() => void model.store.load(true)}>{t('discovery.loadMore')}</ActionButton> : <span>{t('discovery.end')}</span>}</div>}
        </article>)}
      </div>
      <div className={s.paging}><IconButton tone="secondary" label={t('discovery.previous')} disabled={active === 0} onClick={() => move(active - 1)}><ArrowUp size={22} /></IconButton><IconButton tone="secondary" label={t('discovery.next')} disabled={active === count - 1} onClick={() => move(active + 1)}><ArrowDown size={22} /></IconButton></div>
    </>}
  </main>;
}
