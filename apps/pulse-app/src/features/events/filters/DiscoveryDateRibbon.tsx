"use client";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { CalendarDays, ChevronLeft, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';
import type { EventFilters } from '@packages/app-core/events/types';
import { productToday, shiftCalendarDay } from '@packages/app-core/events/discoveryFilters';
import { DATE_RIBBON_CONTEXT_DAYS, DATE_RIBBON_DAY_WIDTH as STEP, dateRibbonIndex, dateRibbonSelection, dateRibbonWindow, withRibbonDay, withoutRibbonDay } from '@packages/app-core/events/dateRibbon';
import { useBackLayer } from '@/lib/navigation/useBackLayer';
import s from './dateRibbon.module.css';

export function DiscoveryDateRibbon({ filters, onChange, onOpenChange, progress, sourceRef, expanded, hidden = false }: {
  filters: EventFilters; onChange: (filters: EventFilters) => void; hidden?: boolean;
  onOpenChange: (open: boolean) => void; progress: MotionValue<number>; sourceRef: RefObject<HTMLElement | null>; expanded: boolean;
}) {
  const { t, i18n } = useTranslation(), id = useId(), today = productToday(), reduced = useReducedMotion();
  const selection = dateRibbonSelection(filters, today), locale = i18n.language.startsWith('ro') ? 'ro-RO' : 'en-GB';
  const contextDays = useMemo(() => Array.from({ length: DATE_RIBBON_CONTEXT_DAYS }, (_, index) => shiftCalendarDay(today, index - DATE_RIBBON_CONTEXT_DAYS)), [today]);
  const setExpanded = onOpenChange;
  const [days, setDays] = useState(() => dateRibbonWindow(selection || today, today));
  const [preview, setPreview] = useState(selection || today);
  const scroll = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null), programmatic = useRef(false);
  const fullWidth = useMotionValue(350), sourceX = useMotionValue(264), sourceY = useMotionValue(0), [width, setWidth] = useState(350);
  const surfaceWidth = useTransform(() => 44 + (fullWidth.get() - 44) * progress.get());
  const surfaceHeight = useTransform(progress, value => 44 + 10 * value), surfaceTop = useTransform(() => sourceY.get() * (1 - progress.get()));
  const surfaceLeft = useTransform(() => sourceX.get() * (1 - progress.get()));
  const surfaceRadius = useTransform(progress, value => 22 + 5 * value);
  const bodyOpacity = useTransform(progress, [0.12, 0.82], [0, 1]);
  const calendarOpacity = useTransform(progress, [0.12, 0.7], [1, 0]), resetOpacity = useTransform(progress, [0.12, 0.7], [0, 1]);
  const iconTop = useTransform(progress, value => 14 - 2.5 * value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), initializing = useRef(false);
  const previewRef = useRef(preview), committed = useRef(selection);
  const wasExpanded = useRef(false);
  const latest = useRef({ filters, onChange, days, today, expanded }); latest.current = { filters, onChange, days, today, expanded };
  useBackLayer(expanded, () => setExpanded(false));
  const formatters = useMemo(() => ({
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }),
    full: new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }),
    month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }),
    year: new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone: 'UTC' }),
  }), [locale]);
  const date = (day: string) => new Date(day + 'T12:00:00Z');
  const clearTimer = () => { clearTimeout(timer.current); timer.current = undefined; };
  const setDayPreview = (day: string) => { previewRef.current = day; setPreview(value => value === day ? value : day); };
  const settle = () => {
    clearTimer(); const current = latest.current;
    if (!current.expanded || initializing.current || programmatic.current) return;
    const day = previewRef.current < current.today ? current.today : previewRef.current;
    if (day !== previewRef.current) {
      programmatic.current = true; setDayPreview(day);
      scroll.current?.scrollTo({ left: current.days.indexOf(day) * STEP, behavior: reduced ? 'instant' : 'smooth' });
    }
    const next = withRibbonDay(current.filters, day, current.today);
    committed.current = day;
    if (next !== current.filters) current.onChange(next);
    const index = current.days.indexOf(day);
    if (index < 12 || index > current.days.length - 13) {
      const window = dateRibbonWindow(day, current.today);
      if (window[0] !== current.days[0]) setDays(window);
    }
  };
  useLayoutEffect(() => {
    if (expanded && !wasExpanded.current) {
      const day = selection && selection >= today ? selection : today;
      setDayPreview(day);
      const window = dateRibbonWindow(day, today);
      if (window[0] !== days[0]) setDays(window);
    }
    wasExpanded.current = expanded;
    if (!expanded || !scroll.current) return;
    initializing.current = true;
    scroll.current.scrollLeft = Math.max(0, days.indexOf(previewRef.current)) * STEP;
    const frame = requestAnimationFrame(() => { initializing.current = false; scroll.current?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [expanded, days]);
  useEffect(() => {
    const control = animate(progress, expanded ? 1 : 0, reduced ? { duration: 0.12 } : { type: 'spring', duration: 0.3, bounce: 0.02 });
    return () => control.stop();
  }, [expanded, onOpenChange, progress, reduced]);
  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const update = () => { const r = node.getBoundingClientRect(), anchor = sourceRef.current?.getBoundingClientRect(); fullWidth.set(r.width); setWidth(r.width); if (anchor) { sourceX.set(anchor.left - r.left); sourceY.set(anchor.top - r.top); } };
    update(); const observer = new ResizeObserver(update); observer.observe(node);
    if (sourceRef.current) observer.observe(sourceRef.current);
    return () => observer.disconnect();
  }, [hidden, expanded, fullWidth, sourceRef, sourceX, sourceY]);
  useEffect(() => {
    if (selection === committed.current) return;
    clearTimer(); committed.current = selection;
    const day = selection && selection >= today ? selection : today;
    setDayPreview(day); setDays(dateRibbonWindow(day, today));
  }, [selection, today]);
  useEffect(() => { if (hidden) { clearTimer(); setExpanded(false); } }, [hidden]);
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  useEffect(() => {
    const node = scroll.current;
    if (!expanded || !node) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault(); programmatic.current = false; node.scrollLeft += event.deltaY;
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [expanded]);
  const pick = (day: string) => {
    if (day < today || day > '2100-12-31') return;
    clearTimer(); programmatic.current = true; setDayPreview(day); committed.current = day;
    const next = withRibbonDay(filters, day, today);
    if (next !== filters) onChange(next);
    const index = days.indexOf(day);
    if (index < 0) setDays(dateRibbonWindow(day, today));
    else scroll.current?.scrollTo({ left: index * STEP, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  if (hidden) return null;
  const trackWidth = Math.max(STEP, width - 88), trackCenter = width / 2 - 44;
  const paddingLeft = Math.max(0, trackCenter - STEP / 2), paddingRight = Math.max(0, trackWidth - trackCenter - STEP / 2);
  return <div ref={root} className={s.root} data-testid="discovery-date-control">
    <motion.div className={s.surface} data-testid="discovery-date-surface" initial={false}
      style={{ width: surfaceWidth, height: surfaceHeight, x: surfaceLeft, y: surfaceTop, borderRadius: surfaceRadius }}>
      <motion.div data-testid="discovery-calendar-morph-icon" className={s.morphIcon} aria-hidden style={{ top: iconTop }}>
        <motion.span data-testid="discovery-calendar-glyph" className={s.iconLayer} style={{opacity:calendarOpacity}}><CalendarDays size={16}/></motion.span>
        <motion.span className={s.iconLayer} style={{opacity:resetOpacity}}><RotateCcw size={16}/></motion.span>
      </motion.div>
      <button ref={trigger} type="button" data-testid="discovery-calendar-toggle" className={s.toggle} aria-label={t('filters.calendar')} aria-expanded={expanded}
        inert={expanded ? true : undefined} onClick={()=>setExpanded(true)}/>
      <motion.div id={id} data-testid={expanded ? 'discovery-date-ribbon' : undefined} className={s.row} style={{ width, opacity: bodyOpacity }} inert={!expanded ? true : undefined}>
        <button type="button" data-testid="discovery-calendar-close" className={s.headerAction} aria-label={t('common.close')} onClick={() => { clearTimer(); setExpanded(false); requestAnimationFrame(() => trigger.current?.focus()); }}><ChevronLeft size={18} aria-hidden/></button>
        <div className={s.track} style={{ width: trackWidth }} data-testid="discovery-date-track">
          <div className={s.center} style={{left:trackCenter-22}} aria-hidden/>
          <div ref={scroll} data-testid="discovery-date-scroll" className={s.scroll} style={{paddingLeft,paddingRight}} tabIndex={expanded ? 0 : -1} role="group" aria-label={t('filters.chooseDay')} aria-describedby={id + '-hint'}
            onKeyDown={event => {
              if (event.key === 'Escape') { event.preventDefault(); setExpanded(false); requestAnimationFrame(() => trigger.current?.focus()); }
              const day = event.key === 'Home' ? today : ['ArrowLeft', 'ArrowRight'].includes(event.key) ? shiftCalendarDay(previewRef.current, event.key === 'ArrowRight' ? 1 : -1) : '';
              if (day) { event.preventDefault(); pick(day); }
            }}
            onPointerDown={() => { programmatic.current = false; }}
            onScroll={event => {
              if (!expanded) return;
              const index = dateRibbonIndex(event.currentTarget.scrollLeft, days.length), day = days[index];
              if (day) {
                if (expanded && day !== previewRef.current && !initializing.current && !programmatic.current) {
                  const crossed = Math.abs(index - days.indexOf(previewRef.current));
                  for (let step = 0; step < crossed; step++) navigator.vibrate?.(5);
                }
                setDayPreview(day);
              }
              if (!initializing.current) { clearTimer(); timer.current = setTimeout(settle, 160); }
            }}>
            {days.map(day => <button key={day} type="button" tabIndex={-1} data-testid={'ribbon-day-' + day} className={s.day} data-centered={preview === day} aria-label={formatters.full.format(date(day))} aria-pressed={selection === day} disabled={day < today} onClick={() => pick(day)}>
              {day === today && <span className={s.pastContext} aria-hidden style={{ width: paddingLeft }}>
                <span className={s.contextRow} style={{ width: contextDays.length * STEP }}>{contextDays.map(contextDay => <span key={contextDay} data-testid={'ribbon-context-day-' + contextDay} className={`${s.day} ${s.pastDay}`}>
                  <span className={s.weekday}>{formatters.weekday.format(date(contextDay)).replace(/\.$/, '')}</span><span className={s.number}>{Number(contextDay.slice(-2))}</span><span className={s.month}>{formatters.month.format(date(contextDay))}</span>
                </span>)}</span>
              </span>}
              <span className={s.weekday}>{formatters.weekday.format(date(day)).replace(/\.$/, '')}</span><span className={s.number}>{Number(day.slice(-2))}</span><span className={s.month}>{formatters.month.format(date(day))}</span>
            </button>)}
          </div>
        </div>
        <button type="button" data-testid="discovery-calendar-reset" aria-label={t('filters.clearDates')} className={`${s.headerAction} ${s.calendarAction}`}
          onClick={()=>{clearTimer();programmatic.current=true;setDayPreview(today);setDays(dateRibbonWindow(today,today));onChange(withoutRibbonDay(filters));}}>
          <span style={{width:16,height:17}} aria-hidden/><span className={s.year}>{formatters.year.format(date(preview))}</span>
        </button>
        <p id={id + '-hint'} className="sr-only">{t('filters.dateRibbonHint')}</p>
      </motion.div>
    </motion.div>
  </div>;
}
