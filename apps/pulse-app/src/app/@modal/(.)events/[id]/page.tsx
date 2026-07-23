"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { User, type Event } from "@/core/DataProvider";
import { EventDetailsSheet } from "@/components/EventDetailsSheet";

export default function EventModalPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const handleClose = () => router.back();

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

  if (loading || !event) return null;

  return <EventDetailsSheet event={event} onClose={handleClose} />;
}
