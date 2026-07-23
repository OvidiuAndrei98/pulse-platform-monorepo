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

  // Factor de stretch orizontal (scaleX) bazat pe viteză
  const xVelocity = useVelocity(x);
  const scaleX = useTransform(xVelocity, [-2500, 0, 2500], [1.2, 1, 1.2]);

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

    const controls = animate(x, page * slotWidth, {
      type: "spring",
      stiffness: 350,
      damping: 26,
      mass: 0.6,
    });

    router.push(items[page].url || "/");

    return () => controls.stop();
  }, [page, slotWidth, dragging, x, router]);

  const activeIndex = dragging ? previewIndex : page;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {/* 
        Container de Sticlă - potrivire 1:1 cu fundalul cardurilor:
        - bg-white/[0.05] + backdrop-blur-2xl
        - border-white/10
      */}
      <div className="pointer-events-auto w-[min(100%,320px)] rounded-full border border-white/10 bg-white/[0.05] p-1.5 shadow-2xl backdrop-blur-2xl">
        <div
          ref={containerRef}
          className="relative flex h-12 items-center justify-between select-none touch-none"
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

          {/* Slider Fluid / Capsulă Activă din Sticlă */}
          {slotWidth > 0 && (
            <motion.div
              className="absolute bottom-0 left-0 top-0 z-20 cursor-grab active:cursor-grabbing"
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
              {/* Capsula interioară - Efect de pastilă de sticlă iluminată */}
              <motion.div
                className="h-full w-full rounded-full border border-white/20 bg-white/10 shadow-lg backdrop-blur-md origin-center"
                style={{ scaleX }}
              />
            </motion.div>
          )}

          {/* Stratul fix de Iconițe */}
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
                    strokeWidth={isActive ? 2.3 : 1.7}
                    className={
                      "h-5 w-5 transition-all duration-200 " +
                      (isActive
                        ? "text-primary drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                        : "text-zinc-400")
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
