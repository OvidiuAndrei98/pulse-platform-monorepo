"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useVelocity,
  useTransform,
  animate,
} from "motion/react";
import { Home, Map, UsersRound, User } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";

type NavItem = {
  icon: typeof Home;
  url: string;
  label: string;
};

export function BottomNav() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [slotWidth, setSlotWidth] = useState(0);

  const router = useRouter();
  const pathname = usePathname();
  const { isOrganizer } = useDataProvider();
  const items: NavItem[] = [
    { icon: Home, label: "Home", url: "/" },
    { icon: Map, label: "Map", url: "/events" },
    { icon: UsersRound, label: "Feed", url: "/feed" },
    { icon: User, label: "Profile", url: isOrganizer ? "/dashboard" : "/users/me" },
  ];

  // Determinăm indexul paginii în funcție de URL-ul curent
  const getCurrentIndexFromPath = () => {
    if (pathname === "/login" || pathname === "/register") return 3;

    const foundIndex = items.findIndex((item) => item.url === pathname);
    if (foundIndex !== -1) return foundIndex;
    if (
      pathname?.startsWith("/dashboard") ||
      pathname?.startsWith("/users/me") ||
      pathname?.startsWith("/ticket-validation")
    ) {
      return 3;
    }
    if (pathname?.startsWith("/feed") || pathname?.startsWith("/users/")) return pathname?.startsWith("/users/") ? 3 : 2;
    if (pathname?.startsWith("/events")) return 1;
    return 0;
  };

  const [page, setPage] = useState(getCurrentIndexFromPath);

  const x = useMotionValue(0);

  // Factor de stretch orizontal (scaleX) bazat pe viteză
  const xVelocity = useVelocity(x);
  const scaleX = useTransform(xVelocity, [-2500, 0, 2500], [1.2, 1, 1.2]);

  const initializedRef = useRef(false);
  const draggingRef = useRef(false);

  const [dragging, setDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(page);

  // Măsurarea lățimii fiecărui slot
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
  }, [items.length]);

  // Sincronizare stării locale când se schimbă ruta
  useEffect(() => {
    const currentIdx = getCurrentIndexFromPath();
    if (currentIdx !== page) {
      setPage(currentIdx);
    }
  }, [pathname, isOrganizer]);

  // Animația de poziționare a capsulei la schimbarea paginii sau la re-size
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

    return () => controls.stop();
  }, [page, slotWidth, dragging, x]);

  const handlePageChange = (idx: number) => {
    if (idx === page) return;
    setPage(idx);
    router.push(items[idx].url);
  };

  const activeIndex = dragging ? previewIndex : page;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {/* 
        Container de Sticlă:
        - Fundal aerisit: bg-[#121217]/40
        - Blur discret: backdrop-blur-md
      */}
      <div className="pointer-events-auto w-[min(100%,320px)] rounded-full border border-white/10 bg-[#121217]/55 p-1.5 shadow-2xl backdrop-blur-lg md:bg-[#121217]/40 md:backdrop-blur-md">
        <div
          ref={containerRef}
          className="relative flex h-12 select-none touch-none items-center justify-between"
        >
          {/* Hit-box pentru click pe tab-uri */}
          <div className="absolute inset-0 z-10 flex">
            {items.map((_, idx) => (
              <div
                key={idx}
                onClick={() => {
                  if (!draggingRef.current) handlePageChange(idx);
                }}
                className="h-full flex-1 cursor-pointer rounded-full"
              />
            ))}
          </div>

          {/* Slider Fluid / Capsulă Activă */}
          {slotWidth > 0 && (
            <motion.div
              className="absolute bottom-0 left-0 top-0 z-20 cursor-grab transform-gpu will-change-transform active:cursor-grabbing"
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

                handlePageChange(clamped);
              }}
            >
              {/* Capsula interioară iluminată */}
              <motion.div
                className="h-full w-full origin-center rounded-full border border-white/20 bg-white/10 shadow-lg backdrop-blur-sm"
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
