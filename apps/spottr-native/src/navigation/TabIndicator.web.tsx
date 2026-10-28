import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { TabIndicatorProps } from "./TabIndicator";
import { retargetTabIndicator, tabIndicatorEasing } from "./tabIndicatorTimeline";

export function TabIndicator({ target, timeline, style }: TabIndicatorProps) {
  const element = useRef<View>(null);
  const [reduceMotion, setReduceMotion] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    const node = element.current as unknown as HTMLElement | null;
    if (!node) return;
    const now = Number(document.timeline.currentTime ?? performance.now());
    const motion = retargetTabIndicator(timeline.current, target, now, reduceMotion);
    timeline.current = motion;
    node.style.transform = `translateX(${target}px)`;
    if (!motion.duration || now >= motion.startedAt + motion.duration || !node.animate) return;
    // The compositor drives transform while React mounts the destination.
    // A new scene joins the original timeline instead of restarting its motion.
    const animation = node.animate([
      { transform: `translateX(${motion.from}px)` },
      { transform: `translateX(${motion.to}px)` },
    ], { duration: motion.duration, easing: tabIndicatorEasing });
    animation.startTime = motion.startedAt;
    return () => animation.cancel();
  }, [target, timeline, reduceMotion]);
  return <View ref={element} testID="tab-indicator" pointerEvents="none" style={style} />;
}
