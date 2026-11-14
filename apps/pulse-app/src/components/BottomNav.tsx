"use client";

import { scrollClientPageToTop } from "@/components/ClientNavigation";
import { useState, useEffect, useId, useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { mainTabs, mainTabIndex, navigateMainTab, TAB_VISUAL_STATE, type TabVisualState } from "@/lib/navigation/tabs";
import { usePathname, useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";
import styles from "./BottomNav.module.css";
import { continuousCornerPath } from '@packages/app-core/navigation/continuousCornerPath';

// Match the current iPhone artwork, including its filled selected icons.
const iconPaths = [
  "M3 11 13 3 23 11V23H17V15H9V23H3Z",
  "M3 6 10 3 17 6 23 3V20L17 23 10 20 3 23ZM10 3V20M17 6V23",
  "M13 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M23 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0M2 23C2 13 16 13 16 23M19 16C23 16 24 19 24 23",
  "M7 3H19M5 6H21M3 10H23V23H3ZM7 19L11 15L14 18L18 13L21 17",
  "M18 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0M3 23C3 12 23 12 23 23",
];

function NavIcon({ index, active }: { index: number; active: boolean }) {
  return <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="white"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={iconPaths[index]} fill={active && index !== 1 && index !== 3 ? "white" : "none"} />
  </svg>;
}

export function BottomNavGate() {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/register") return null;
  if (pathname === "/wardrobe") return null;
  // Conversation/detail routes use the existing full-screen detail stack;
  // the persistent tab bar itself and its animation remain untouched.
  if (pathname?.startsWith('/groups/')) return null;
  if (pathname === "/admin" || pathname?.startsWith("/admin/")) return null;
  if (pathname === "/checkout/success" || pathname === "/checkout/success/") return null;
  if (/^\/events\/[^/]+\/?$/.test(pathname ?? "")) return null;

  return <BottomNav />;
}

function ContinuousShape({ clipId }: { clipId?: string }) {
  const element = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: clipId ? 350 : 76, height: clipId ? 62 : 52 });
  const d = useMemo(() => continuousCornerPath(size.width, size.height, size.height / 2), [size]);
  const edge = useMemo(() => continuousCornerPath(size.width - 1, size.height - 1, (size.height - 1) / 2), [size]);

  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) {
        setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <svg ref={element} viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none"
    aria-hidden="true" focusable="false" className={styles.indicatorShape}>
    {clipId && <defs>
      <clipPath id={clipId} clipPathUnits="objectBoundingBox">
        <path d={d} transform={`scale(${1 / size.width} ${1 / size.height})`} />
      </clipPath>
    </defs>}
    {clipId
      ? <path d={edge} transform="translate(0.5 0.5)" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      : <path d={d} fill="currentColor" />}
  </svg>;
}

function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isOrganizer } = useDataProvider();
  const { t } = useTranslation();
  const clipId=useId();
  const items = mainTabs(isOrganizer).map(tab => ({ label: t(tab.label), url: tab.path }));
  const getCurrentIndexFromPath = () => Math.max(0, mainTabIndex(pathname ?? "/"));

  const [activeIndex, setActiveIndex] = useState(getCurrentIndexFromPath);
  const [indicatorIndex, setIndicatorIndex] = useState(getCurrentIndexFromPath);
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
    <div data-bottom-nav onDragStart={(event) => event.preventDefault()} className={styles.position}>
      <div data-bottom-nav-glass className={styles.glass}
        style={{ "--nav-span": items.length - 1 + 1.15,clipPath:`url("#${clipId}")` } as CSSProperties}>
        <ContinuousShape clipId={clipId}/>
        <div className={styles.track}>
          <div
            data-nav-indicator
            aria-hidden="true"
            className={styles.indicator}
            style={{ transform: `translateX(calc(var(--nav-spacing) * ${indicatorIndex}))` }}
          ><ContinuousShape/></div>
          {items.map((item, idx) => {
            const isActive = activeIndex === idx;

            return (
              <button
                key={item.url}
                type="button"
                draggable={false}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  // Allow briefly overlapping touches (alternating thumbs).
                  // Secondary mouse/pen buttons still do not activate tabs.
                  // Respond on contact, even if a hurried tap moves before
                  // release. Prevent mouse selection / native drag initiation.
                  event.preventDefault();
                  handleTabClick(idx, item.url);
                }}
                onClick={(event) => {
                  // Pointer activation already ran on down. Retain the click
                  // path for keyboard, assistive technology and programmatic use.
                  if (event.detail === 0) handleTabClick(idx, item.url);
                }}
                className={styles.tab}
              >
                <NavIcon index={idx} active={isActive} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
