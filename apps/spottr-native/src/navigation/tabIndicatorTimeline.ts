export type TabIndicatorTimeline = {
  from: number;
  to: number;
  startedAt: number;
  duration: number;
};

export type TabIndicatorTimelineRef = { current: TabIndicatorTimeline | null };

export const tabIndicatorDuration = 320;
export const tabIndicatorEasing = "cubic-bezier(0.4, 0, 0.2, 1)";

// Sample the same easing as the browser, only when a new tap interrupts it.
// No JavaScript frame loop is needed to keep separate stack scenes in sync.
export function tabIndicatorPosition(timeline: TabIndicatorTimeline, now: number) {
  if (!timeline.duration || now >= timeline.startedAt + timeline.duration) return timeline.to;
  if (now <= timeline.startedAt) return timeline.from;
  const progress = (now - timeline.startedAt) / timeline.duration;
  let low = 0, high = 1;
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2;
    const x = 1.2 * (1 - t) ** 2 * t + 0.6 * (1 - t) * t ** 2 + t ** 3;
    if (x < progress) low = t; else high = t;
  }
  const t = (low + high) / 2;
  const eased = 3 * t ** 2 - 2 * t ** 3;
  return timeline.from + (timeline.to - timeline.from) * eased;
}

export function retargetTabIndicator(
  timeline: TabIndicatorTimeline | null,
  target: number,
  now: number,
  reduceMotion: boolean,
): TabIndicatorTimeline {
  if (!timeline || reduceMotion) return { from: target, to: target, startedAt: now, duration: 0 };
  if (timeline.to === target) return timeline;
  return { from: tabIndicatorPosition(timeline, now), to: target, startedAt: now, duration: tabIndicatorDuration };
}
