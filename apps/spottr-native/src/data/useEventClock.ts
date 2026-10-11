import { useEffect, useState } from "react";
import { AppState } from "react-native";
import type { Event } from "./events";

export function useEventClock(event?: Event) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const boundaries = [
      event?.startTime,
      event?.endTime,
      ...(event?.ticketTypes.flatMap((t) => [t.startSales, t.endSales]) ?? []),
    ]
      .map((value) => Date.parse(value || ""))
      .filter((value) => value > Date.now());
    const delay = Math.max(
      1,
      Math.min(60_000, ...boundaries.map((value) => value - Date.now() + 1)),
    );
    const timer = setTimeout(() => setNow(Date.now()), delay);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [event, now]);
  return now;
}
