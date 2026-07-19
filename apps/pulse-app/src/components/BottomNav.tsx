"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useVelocity,
  useTransform,
  animate,
} from "motion/react";
import { Home, Map, User } from "lucide-react";
import { useRouter } from "next/navigation";

type NavItem = {
  icon: typeof Home;
  index?: number;
  url?: string;
  label: string;
};

const items: NavItem[] = [
  { icon: Home, label: "Home", index: 0, url: "/" },
  { icon: Map, label: "Map", index: 1, url: "/events" },
  { icon: User, label: "Profile", index: 2, url: "/users/me" },
];

export function BottomNav() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [slotWidth, setSlotWidth] = useState(0);
  const [page, setPage] = useState(0);
  const router = useRouter();

  const x = useMotionValue(0);

  // Capturăm viteza de mișcare a capsulei (atât din drag, cât și din animația spring)
  const xVelocity = useVelocity(x);

  // Mapăm viteza într-un factor de stretch orizontal (scaleX)
  // Cu cât viteza e mai mare (pozitivă sau negativă), cu atât se extinde mai mult pe X ca un fluid (max +25%)
  const scaleX = useTransform(xVelocity, [-2500, 0, 2500], [1.25, 1, 1.25]);

  const initializedRef = useRef(false);
  const draggingRef = useRef(false);

  const [dragging, setDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(page);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      setSlotWidth(el.clientWidth / items.length);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (dragging || slotWidth === 0) return;

    setPreviewIndex(page);

    if (!initializedRef.current) {
      x.set(page * slotWidth);
      initializedRef.current = true;
      return;
    }

    // Un spring ceva mai elastic pentru a pune în valoare deformarea fluidă la destinație
    const controls = animate(x, page * slotWidth, {
      type: "spring",
      stiffness: 350,
      damping: 26,
      mass: 0.6,
    });

    router.push(items[page].url || "/");

    return () => controls.stop();
  }, [page, slotWidth, dragging, x]);

  const activeIndex = dragging ? previewIndex : page;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-4">
      {/* Container curat, rotund complet */}
      <div className="pointer-events-auto w-[min(100%,390px)] rounded-full border border-neutral-800 bg-neutral-950 p-1.5 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.9)]">
        <div
          ref={containerRef}
          className="relative flex items-center justify-between h-14 select-none touch-none"
        >
          {/* Hit-box direct */}
          <div className="absolute inset-0 z-10 flex">
            {items.map((_, idx) => (
              <div
                key={idx}
                onClick={() => {
                  if (!draggingRef.current) setPage(idx);
                }}
                className="h-full flex-1 cursor-pointer rounded-full"
              />
            ))}
          </div>

          {/* Core Slider cu capabilitate de transformare fluidă */}
          {slotWidth > 0 && (
            <motion.div
              className="absolute left-0 top-0 bottom-0 z-20 cursor-grab active:cursor-grabbing"
              style={{
                x,
                width: slotWidth,
              }}
              drag="x"
              dragConstraints={{
                left: 0,
                right: (items.length - 1) * slotWidth,
              }}
              dragElastic={0}
              dragMomentum={false}
              onDragStart={() => {
                draggingRef.current = true;
                setDragging(true);
              }}
              onDrag={() => {
                const currentX = x.get();
                const idx = Math.round(currentX / slotWidth);
                const clamped = Math.min(items.length - 1, Math.max(0, idx));

                if (clamped !== previewIndex) {
                  setPreviewIndex(clamped);
                }
              }}
              onDragEnd={() => {
                draggingRef.current = false;
                setDragging(false);

                const currentX = x.get();
                const idx = Math.round(currentX / slotWidth);
                const clamped = Math.min(items.length - 1, Math.max(0, idx));

                animate(x, clamped * slotWidth, {
                  type: "spring",
                  stiffness: 380,
                  damping: 24,
                  mass: 0.55,
                });

                setPage(clamped);
              }}
            >
              {/* Capsulă Liquid - scaleX reacționează instantaneu la inerție și viteză */}
              <motion.div
                className="w-full h-full rounded-full border border-neutral-700 bg-neutral-900 shadow-[0_4px_12px_rgba(0,0,0,0.5)] origin-center"
                style={{ scaleX }}
              />
            </motion.div>
          )}

          {/* Stratul fix de iconițe de 24px */}
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-between">
            {items.map((item, idx) => {
              const Icon = item.icon;
              const isActive = activeIndex === idx;

              return (
                <div
                  key={item.label}
                  className="flex h-full flex-1 items-center justify-center"
                >
                  <Icon
                    strokeWidth={isActive ? 2.2 : 1.7}
                    className={
                      "h-6 w-6 transition-colors duration-200 " +
                      (isActive ? "text-white" : "text-neutral-500")
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
