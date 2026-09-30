"use client";

import type { HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { eventCategories } from "@/core/mappers";

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={classes("animate-pulse motion-reduce:animate-none bg-white/[0.075]", className)}
      {...props}
    />
  );
}

export function HomeCarouselSkeleton() {
  return (
    <section aria-hidden="true" className="mt-4">
      <div className="app-page-gutter mx-auto flex h-8 max-w-7xl items-center justify-between">
        <Skeleton className="h-5 w-36 rounded-md" />
        <Skeleton className="h-3 w-12 rounded-md" />
      </div>
      <div className="app-page-gutter mx-auto mt-2 flex max-w-7xl gap-4 overflow-hidden pb-2">
        {[0, 1, 2, 3].map(index => (
          <div key={index} className="w-[220px] shrink-0 rounded-[26px] border border-white/5 bg-[#090909] p-2 md:w-[260px]">
            <Skeleton className="aspect-[4/3] w-full rounded-[18px]" />
            <div className="mt-1 space-y-2 p-1">
              <div className="flex h-7 items-center"><Skeleton className="h-5 w-3/4 rounded-md" /></div>
              <Skeleton className="h-6 w-20 rounded-full" />
              <div className="flex h-[18px] items-end"><Skeleton className="h-3.5 w-32 rounded-md" /></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FeedActivitySkeleton() {
  return (
    <div aria-hidden="true" className="border-b border-white/[0.08] pb-6 last:border-b-0">
      <div className="flex h-[58px] items-center gap-3 pb-4">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-3 w-44 max-w-full rounded-md" />
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.035] p-3">
        <Skeleton className="h-16 w-14 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="h-5 w-3/4 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function ProfileLoadingState() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("common.loading")} className="relative min-h-screen w-full pb-[110px]">
      <div className="app-page-gutter mx-auto max-w-md pt-10 md:max-w-7xl md:pt-16">
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-12">
          <div className="space-y-6 md:col-span-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-8 w-3/4 rounded-lg" />
                <Skeleton className="mt-0.5 h-5 w-full rounded-md" />
                <Skeleton className="mt-2 h-[26px] w-28 rounded-full" />
              </div>
            </div>
            <Skeleton className="h-[126px] rounded-[26px] xl:h-[74px]" />
            <div aria-hidden="true" className="rounded-[26px] border border-white/10 p-4">
              <Skeleton className="h-5 w-40 rounded-md" />
              <Skeleton className="mt-1 h-10 w-full rounded-md" />
              <div className="mt-4 flex flex-wrap gap-2">
                {eventCategories.map(category => (
                  <span key={category} className="animate-pulse rounded-full border border-transparent bg-white/[0.075] px-3 py-1.5 text-[11px] font-semibold text-transparent motion-reduce:animate-none">{category}</span>
                ))}
              </div>
            </div>
            <Skeleton className="hidden h-64 rounded-[26px] md:block" />
          </div>
          <div className="space-y-8 md:col-span-8">
            <div className="flex h-8 items-center justify-between">
              <Skeleton className="h-6 w-36 rounded-md" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>
            <Skeleton className="h-56 rounded-[26px]" />
            <Skeleton className="h-6 w-36 rounded-md" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map(index => <Skeleton key={index} className="h-[74px] rounded-2xl" />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PageLoadingState({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const statusLabel = label ?? t("common.loading");

  return (
    <div
      role="status"
      aria-label={statusLabel}
      className={classes(
        "flex min-h-[48vh] w-full items-center justify-center px-5",
        className,
      )}
    >
      <div className="w-full max-w-xl space-y-4">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-8 w-3/5 rounded-lg" />
        <Skeleton className="h-4 w-full rounded-full" />
        <Skeleton className="h-4 w-4/5 rounded-full" />
      </div>
    </div>
  );
}

export function EventCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={classes(
        "event-card",
        className,
      )}
    >
      <div className="aspect-square overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.035] sm:hidden">
        <Skeleton className="h-full w-full opacity-60" />
      </div>
      <div className="mt-2 space-y-2 px-1 sm:hidden">
        <Skeleton className="h-4 w-3/4 rounded-md" />
        <Skeleton className="h-3 w-full rounded-full" />
      </div>
      <div className="relative hidden h-64 overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.035] sm:block">
        <Skeleton className="absolute inset-0 opacity-60" />
        <div className="absolute inset-x-5 bottom-5 space-y-3">
          <Skeleton className="h-3 w-16 rounded-full bg-white/10" />
          <Skeleton className="h-6 w-3/5 rounded-lg bg-white/10" />
          <Skeleton className="h-3 w-4/5 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  );
}

export function EventDetailsSkeleton({ label }: { label?: string }) {
  const { t } = useTranslation();
  const statusLabel = label ?? t("common.loading");

  return (
    <div
      role="status"
      aria-label={statusLabel}
      className="min-h-screen bg-background px-5 pb-28 pt-10"
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-4 w-28 rounded-full" />
        <Skeleton className="aspect-[16/8] w-full rounded-2xl" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-20 rounded-full" />
          <Skeleton className="h-9 w-3/5 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-4/5 rounded-full" />
        </div>
      </div>
    </div>
  );
}
