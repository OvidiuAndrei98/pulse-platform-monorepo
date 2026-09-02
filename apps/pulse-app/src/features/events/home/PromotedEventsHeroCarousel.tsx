"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEventDetails } from "@/components/EventDetailsSheet";
import type { PromotedEvent } from "@/core/DataProvider";
import { formatEventDateShort, formatEventTime } from "@/features/events/dateFormat";

interface PromotedEventsHeroCarouselProps {
  items: readonly PromotedEvent[];
  autoPlayInterval?: number;
  onEventOpen?: (item: PromotedEvent) => void;
  onEventVisible?: (item: PromotedEvent) => void;
}

export function PromotedEventsHeroCarousel({
  items,
  autoPlayInterval = 4500,
  onEventOpen,
  onEventVisible,
}: PromotedEventsHeroCarouselProps) {
  const { t } = useTranslation();
  const { open } = useEventDetails();
  const heroRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);

  const goTo = useCallback((index: number) => {
    if (!items.length) return;
    setActiveIndex((index + items.length) % items.length);
  }, [items.length]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const timer = window.setInterval(() => goTo(activeIndex + 1), autoPlayInterval);
    return () => window.clearInterval(timer);
  }, [activeIndex, autoPlayInterval, goTo, items.length, paused]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.4)),
      { threshold: [0.4] },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const activeItem = items[activeIndex];

  useEffect(() => {
    if (visible && activeItem) onEventVisible?.(activeItem);
  }, [activeItem, onEventVisible, visible]);

  if (!activeItem) return null;

  const event = activeItem.event;
  const openEvent = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onEventOpen?.(activeItem);
    open(event);
  };

  return (
    <section
      className="mt-6"
      aria-roledescription={t("common.carousel")}
      aria-label={t("promotions.recommended")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(focusEvent) => {
        if (!focusEvent.currentTarget.contains(focusEvent.relatedTarget)) setPaused(false);
      }}
    >
      <div className="app-page-gutter mx-auto mb-4 flex max-w-7xl items-center justify-between gap-4">
        <h2 className="text-base font-semibold md:text-lg">{t("promotions.recommended")}</h2>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">
          {activeIndex + 1} / {items.length}
        </span>
      </div>

      <div ref={heroRef} className="app-page-gutter mx-auto max-w-7xl">
        <div className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-[#101014] shadow-2xl shadow-black/30 md:rounded-[32px]">
          <button
            type="button"
            onClick={openEvent}
            onTouchStart={(touchEvent) => {
              touchStartXRef.current = touchEvent.touches[0]?.clientX ?? null;
              suppressClickRef.current = false;
            }}
            onTouchEnd={(touchEvent) => {
              const startX = touchStartXRef.current;
              const endX = touchEvent.changedTouches[0]?.clientX;
              touchStartXRef.current = null;
              if (startX == null || endX == null || Math.abs(startX - endX) < 45) return;
              suppressClickRef.current = true;
              goTo(activeIndex + (startX > endX ? 1 : -1));
            }}
            className="relative block aspect-[4/3] w-full overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:aspect-[16/8] lg:aspect-[21/8]"
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={activeItem.campaignId}
                initial={{ opacity: 0, scale: 1.025 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="absolute inset-0"
              >
                <Image
                  src={event.bannerUrl || "/images/events/default.jpg"}
                  alt={event.title}
                  fill
                  priority={activeIndex === 0}
                  sizes="(max-width: 768px) 100vw, 1280px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-black/20" />
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />
              </motion.div>
            </AnimatePresence>

            <div className="absolute inset-0 z-10 flex flex-col justify-between p-4 sm:p-6 md:p-8">
              <div className="flex items-start justify-end gap-3">
                <span className="rounded-full border border-white/15 bg-black/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md sm:text-sm">
                  {formatEventDateShort(event.startTime)} · {formatEventTime(event.startTime)}
                </span>
              </div>

              <div className="max-w-3xl">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary sm:text-xs">
                  {event.category}
                </p>
                <h3 className="line-clamp-2 text-2xl font-black leading-[1.02] tracking-[-0.035em] text-white sm:text-4xl md:text-5xl">
                  {event.title}
                </h3>
                <p className="mt-3 flex items-center gap-1.5 truncate text-sm text-white/75 sm:text-base">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  {event.locationName}{event.city ? ` · ${event.city}` : ""}
                </p>
              </div>
            </div>
          </button>

          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goTo(activeIndex - 1)}
                aria-label={t("common.back")}
                className="absolute left-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white opacity-0 backdrop-blur-md transition hover:bg-black/75 group-hover:opacity-100 focus:opacity-100 sm:grid"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => goTo(activeIndex + 1)}
                aria-label={t("common.next")}
                className="absolute right-4 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/55 text-white opacity-0 backdrop-blur-md transition hover:bg-black/75 group-hover:opacity-100 focus:opacity-100 sm:grid"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {items.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {items.map((item, index) => (
            <button
              key={item.campaignId}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`${t("promotions.recommended")} ${index + 1}`}
              aria-current={activeIndex === index ? "true" : undefined}
              className={`h-1.5 rounded-full transition-all duration-300 ${activeIndex === index ? "w-7 bg-primary" : "w-1.5 bg-white/25 hover:bg-white/45"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
