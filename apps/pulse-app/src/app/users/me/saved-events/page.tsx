"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Bookmark, ChevronLeft } from "lucide-react";
import { BackLink } from "@/components/BackLink";
import { SavedEventCard } from "@/components/profile/SavedEventCard";
import { RequestError } from "@/components/ui/RequestFeedback";
import type { Event } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { useClientQuery } from "@/lib/useClientQuery";

export default function SavedEventsPage() {
  const { user, loading } = useDataProvider();
  const { t } = useTranslation();
  const router = useRouter();
  const { data: events, pending, error, retry } = useClientQuery<Event[]>(
    user ? `saved-events:${user.properties.id}` : null,
    () => user!.getSavedEvents(), [],
  );

  useEffect(() => {
    if (!loading && !user) router.replace("/login?returnTo=%2Fusers%2Fme%2Fsaved-events");
  }, [loading, user, router]);

  return (
    <main className="app-page-spacing mx-auto min-h-screen max-w-3xl pb-32 text-foreground">
      <BackLink href="/users/me" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary">
        <ChevronLeft className="h-4 w-4" /> {t("tickets.profile")}
      </BackLink>
      <h1 className="mt-5 flex items-center gap-2 text-2xl font-semibold">
        <Bookmark className="h-5 w-5 text-primary" /> {t("userProfile.savedEvents")}
      </h1>
      <div className="mt-6">
        {loading || !user || pending ? (
          <div role="status" aria-label={t("common.loading")} className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            ))}
          </div>
        ) : error ? (
          <RequestError onRetry={retry} />
        ) : events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">
            {t("userProfile.noSavedEvents")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {events.map((event) => <SavedEventCard key={event.id} event={event} />)}
          </div>
        )}
      </div>
    </main>
  );
}
