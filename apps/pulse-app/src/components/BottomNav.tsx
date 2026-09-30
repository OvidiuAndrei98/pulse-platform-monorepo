"use client";

import { scrollClientPageToTop } from "@/components/ClientNavigation";
import { useState, useEffect, useRef } from "react";
import { mainTabs, mainTabIndex, navigateMainTab, TAB_VISUAL_STATE, type TabVisualState } from "@/lib/navigation/tabs";
import { Home, Map, UsersRound, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  const router = useRouter();
  const { isOrganizer } = useDataProvider();
  const { t } = useTranslation();
  const icons = { home: Home, map: Map, feed: UsersRound, profile: UserRound };
  const items: NavItem[] = mainTabs(isOrganizer).map(tab => ({ icon: icons[tab.id], label: t(tab.label), url: tab.path }));
  const getCurrentIndexFromPath = () => Math.max(0, mainTabIndex(pathname ?? "/"));

  const [activeIndex, setActiveIndex] = useState(getCurrentIndexFromPath);
  const [indicatorIndex, setIndicatorIndex] = useState(getCurrentIndexFromPath);
  const navbar = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const pendingVisual = useRef<string | null>(null);

  useEffect(() => {
    const onVisualState = (event: Event) => {
      const { href, phase } = (event as CustomEvent<TabVisualState>).detail;
      if (phase === "pending") {
        pendingVisual.current = href;
        const index = Math.max(0, mainTabIndex(href));
        setActiveIndex(index);
        setIndicatorIndex(index);
      } else if (pendingVisual.current === href) {
        pendingVisual.current = null;
      }
    };
    window.addEventListener(TAB_VISUAL_STATE, onVisualState);
    return () => window.removeEventListener(TAB_VISUAL_STATE, onVisualState);
  }, []);

  // Warm route bundles in production; navigation never waits for prefetch.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      mainTabs(isOrganizer).forEach(tab => router.prefetch(tab.path));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [router, isOrganizer]);

  useEffect(() => {
    const index = Math.max(0, mainTabIndex(pathname ?? "/"));
    if (!pendingVisual.current || pendingVisual.current === pathname) {
      pendingVisual.current = null;
      setActiveIndex(index);
      setIndicatorIndex(index);
    }
  }, [pathname, isOrganizer]);

  const handleTabClick = (idx: number, url: string) => {
    // The current URL can still be Home while Map is loading. A tap on Home
    // must supersede that navigation, rather than only scrolling the old page.
    if (pathname === url && activeIndex === idx && !pendingVisual.current) { scrollClientPageToTop(); return; }

    if (navigateMainTab(url)) {
      setActiveIndex(idx);
      setIndicatorIndex(idx);
    }
  };

  return (
    <div ref={navbar} data-bottom-nav className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      {/* 
        Trecere insesizabilă (Smooth Gradient):
        - `from-[#18181f]/40` sus
        - `via-[#141419]/52` la mijloc (tranziție extrem de lină)
        - `to-[#0d0d12]/65` jos
        - `shadow-[inset_0_-8px_16px_rgba(0,0,0,0.35)]`: creează umbră naturală în bază
      */}
      {/* A slightly denser mobile tint compensates for the smaller blur radius. */}
      <div data-bottom-nav-glass className="pointer-events-auto relative w-[min(100%,360px)] rounded-full border border-white/10 bg-gradient-to-b from-[#1F1F1F]/48 via-[#1A1A1A]/58 to-[#121212]/70 p-2 shadow-[0_12px_32px_rgba(0,0,0,0.6),inset_0_-8px_16px_rgba(0,0,0,0.35)] md:from-[#1F1F1F]/40 md:via-[#1A1A1A]/52 md:to-[#121212]/65">
        <div className="relative flex h-12 w-full items-center justify-between">
          <div
            ref={indicator}
            data-nav-indicator
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 rounded-full border border-primary/60 bg-primary/38 shadow-[0_0_12px_rgba(225,29,72,0.4)] backdrop-blur-none transition-transform duration-[240ms] ease-[cubic-bezier(.22,.8,.25,1)] motion-reduce:transition-none md:backdrop-blur-sm"
            style={{ width: `${100 / items.length}%`, transform: `translateX(${indicatorIndex * 100}%)` }}
          />
          {items.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeIndex === idx;

            return (
              <button
                key={item.url}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => handleTabClick(idx, item.url)}
                className="relative flex h-full flex-1 flex-col items-center justify-center gap-[2px] outline-none"
              >
                {/* Capsula roz magenta care îmbracă ICONIȚA + TEXTUL */}

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
