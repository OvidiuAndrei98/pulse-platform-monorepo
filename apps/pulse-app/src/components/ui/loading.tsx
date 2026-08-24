"use client";

import type { HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

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
      className={classes("animate-pulse bg-white/[0.075]", className)}
      {...props}
    />
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
