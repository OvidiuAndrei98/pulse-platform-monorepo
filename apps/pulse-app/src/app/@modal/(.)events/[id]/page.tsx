"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { User, type Event } from "@/core/DataProvider";
import { EventDetailsSheet } from "@/components/EventDetailsSheet";
import { Skeleton } from "@/components/ui/loading";

export default function EventModalPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const handleClose = () => router.back();

  const handleOpenOrganizerProfile = (organizerId: string, returnTo: string) => {
    router.replace(
      `/users/${organizerId}?returnTo=${encodeURIComponent(returnTo)}`,
    );
  };

  useEffect(() => {
    async function fetchEvent() {
      try {
        const data = await User.getPublicEventById(params.id);
        setEvent(data);
      } catch (err) {
        console.error("Failed to load event details", err);
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [params.id]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-end bg-black/65 p-4 backdrop-blur-sm md:place-items-center">
        <div className="w-full max-w-2xl space-y-5 rounded-2xl border border-white/10 bg-[#101311] p-5 md:p-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-8 w-3/5 rounded-lg" />
          <Skeleton className="h-4 w-full rounded-full" />
        </div>
      </div>
    );
  }
  if (!event) return null;

  return (
    <EventDetailsSheet
      event={event}
      onClose={handleClose}
      onOpenOrganizerProfile={handleOpenOrganizerProfile}
    />
  );
}
