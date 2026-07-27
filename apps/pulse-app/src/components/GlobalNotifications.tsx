"use client";

import { usePathname } from "next/navigation";
import { NotificationsPopover } from "@/components/NotificationsPopover";
import { useDataProvider } from "@/core/DataProviderContext";

const hiddenPathPrefixes = [
  "/login",
  "/register",
  "/legal",
  "/organizers/agreement",
  "/reset-password",
  "/scan",
  "/ticket-validation",
  "/dashboard",
];

export function GlobalNotifications() {
  const pathname = usePathname();
  const { user, loading } = useDataProvider();

  if (
    loading ||
    !user ||
    hiddenPathPrefixes.some((prefix) => pathname?.startsWith(prefix))
  ) {
    return null;
  }

  return (
    <div className="fixed right-5 top-5 z-[90] sm:right-7 sm:top-6">
      <NotificationsPopover />
    </div>
  );
}
