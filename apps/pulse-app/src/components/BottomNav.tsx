"use client";

import { useRef, useState, useEffect, useTransition } from "react";
import { motion } from "motion/react";
import { Home, Map, UsersRound, User } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";

type NavItem = {
  icon: typeof Home;
  url: string;
  label: string;
};

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isOrganizer } = useDataProvider();
  const { t } = useTranslation();
  const [, startTransition] = useTransition();

  const items: NavItem[] = [
    { icon: Home, label: t("nav.home"), url: "/" },
    { icon: Map, label: t("nav.map"), url: "/events" },
    { icon: UsersRound, label: t("nav.feed"), url: "/feed" },
    {
      icon: User,
      label: t("nav.profile"),
      url: isOrganizer ? "/dashboard" : "/users/me",
    },
  ];

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
      router.push(url);
    });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div className="pointer-events-auto w-[min(100%,320px)] rounded-full border border-white/10 bg-[#121217]/90 p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-md">
        <div className="relative flex h-12 w-full items-center justify-between">
          {items.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeIndex === idx;

            return (
              <button
                key={item.url}
                onClick={() => handleTabClick(idx, item.url)}
                className="relative flex h-full flex-1 items-center justify-center outline-none"
              >
                {/* Capsulă animată dinamic cu culoarea primary */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabCapsule"
                    className="absolute inset-0 rounded-full border border-primary/40 bg-primary/15 shadow-[0_0_15px_var(--primary,#FF0044)]"
                    style={{
                      // Glow dinamic folosind variabila CSS de primary
                      boxShadow: "0 0 15px hsl(var(--primary) / 0.35)",
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                    }}
                  />
                )}

                <Icon
                  strokeWidth={isActive ? 2.3 : 1.7}
                  className={
                    "relative z-10 h-5 w-5 transition-colors duration-150 " +
                    (isActive
                      ? "text-primary drop-shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
                      : "text-zinc-400")
                  }
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
