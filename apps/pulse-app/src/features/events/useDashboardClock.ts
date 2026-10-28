"use client";
import { useEffect, useState } from "react";

export function useDashboardClock(
  events: readonly { startTime: string; endTime: string }[],
) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const current = Date.now();
    const boundaries = events
      .flatMap((event) => [
        Date.parse(event.startTime),
        Date.parse(event.endTime),
      ])
      .filter((time) => time > current);
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(
        1,
        Math.min(60_000, ...boundaries.map((time) => time - current + 1)),
      ),
    );
    const wake = () => setNow(Date.now());
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [events, now]);
  return now;
}
