"use client";

import { useRef, useState, useEffect, useTransition } from "react";
import { motion } from "motion/react";
import { Home, Map, UsersRound, UserRound } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";

type NavItem = {
  icon: typeof Home;
  url: string;
  label: string;
};

export function BottomNavGate() {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/register") return null;

  return <BottomNav />;
}

function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isOrganizer } = useDataProvider();
  const { t } = useTranslation();
  const [, startTransition] = useTransition();

  const items: NavItem[] = [
    { icon: Home, label: t("nav.home", "Home"), url: "/" },
    { icon: Map, label: t("nav.map", "Events"), url: "/events" },
    { icon: UsersRound, label: t("nav.feed", "Feed"), url: "/feed" },
    {
      icon: UserRound,
      label: t("nav.profile", "Profile"),
      url: isOrganizer ? "/dashboard" : "/users/me",
    },
  ];

  const getCurrentIndexFromPath = () => {
    const foundIndex = items.findIndex((item) => item.url === pathname);
    if (foundIndex !== -1) return foundIndex;
    if (
      pathname?.startsWith("/dashboard") ||
      pathname?.startsWith("/users/me") ||
      pathname?.startsWith("/ticket-validation")
    ) {
      return 3;
    }
    if (pathname?.startsWith("/feed") || pathname?.startsWith("/users/"))
      return pathname?.startsWith("/users/") ? 3 : 2;
    if (pathname?.startsWith("/events")) return 1;
    return 0;
  };

  const [activeIndex, setActiveIndex] = useState(getCurrentIndexFromPath);

  useEffect(() => {
    setActiveIndex(getCurrentIndexFromPath());
  }, [pathname, isOrganizer]);

  const handleTabClick = (idx: number, url: string) => {
    if (idx === activeIndex) return;

    setActiveIndex(idx);

    startTransition(() => {
      router.push(url, { scroll: false });
    });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      {/* 
        Trecere insesizabilă (Smooth Gradient):
        - `from-[#18181f]/40` sus
        - `via-[#141419]/52` la mijloc (tranziție extrem de lină)
        - `to-[#0d0d12]/65` jos
        - `shadow-[inset_0_-8px_16px_rgba(0,0,0,0.35)]`: creează umbră naturală în bază
      */}
      <div className="pointer-events-auto relative w-[min(100%,360px)] rounded-full border border-white/10 bg-gradient-to-b from-[#18181f]/40 via-[#141419]/52 to-[#0d0d12]/65 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.6),inset_0_-8px_16px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
        <div className="relative flex h-12 w-full items-center justify-between">
          {items.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeIndex === idx;

            return (
              <button
                key={item.url}
                onClick={() => handleTabClick(idx, item.url)}
                className="relative flex h-full flex-1 flex-col items-center justify-center gap-[2px] outline-none"
              >
                {/* Capsula roz magenta care îmbracă ICONIȚA + TEXTUL */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabCapsule"
                    layoutDependency={activeIndex}
                    className="absolute inset-0 rounded-full border border-primary/60 bg-primary/38 shadow-[0_0_12px_rgba(225,29,72,0.4)] backdrop-blur-sm"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 28,
                    }}
                  />
                )}

                {/* Iconița */}
                <Icon
                  strokeWidth={isActive ? 2.2 : 1.6}
                  className={
                    "relative z-10 h-5 w-5 transition-colors duration-150 " +
                    (isActive ? "text-primary" : "text-zinc-400")
                  }
                />

                {/* Textul de sub iconiță */}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
