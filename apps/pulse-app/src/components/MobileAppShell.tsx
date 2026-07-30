"use client";

import dynamic from "next/dynamic";

const MobileAppProviders = dynamic(
  () => import("./MobileAppProviders").then((module) => module.MobileAppProviders),
  {
    ssr: false,
    loading: () => <div className="min-h-screen bg-[#0b0c0e]" />,
  },
);

export function MobileAppShell({ children }: { children: React.ReactNode }) {
  return <MobileAppProviders>{children}</MobileAppProviders>;
}
