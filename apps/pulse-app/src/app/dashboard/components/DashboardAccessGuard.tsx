"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";

export function DashboardAccessGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user, loading, isOrganizer } = useDataProvider();
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (pathname === "/ticket-validation") {
      router.replace("/dashboard/ticket-validation");
      return;
    }
    if (isOrganizer) {
      setCheckingAccess(false);
      return;
    }

    let cancelled = false;
    void user.getValidationEvents()
      .then((events) => {
        if (cancelled) return;
        if (!events.length) {
          router.replace("/users/me");
          return;
        }
        if (!pathname.startsWith("/dashboard/ticket-validation")) {
          router.replace("/dashboard/ticket-validation");
          return;
        }
        setCheckingAccess(false);
      })
      .catch(() => {
        if (!cancelled) router.replace("/users/me");
      });

    return () => {
      cancelled = true;
    };
  }, [isOrganizer, loading, pathname, router, user]);

  if (loading || checkingAccess) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">{t("dashboardNav.checkingAccess")}</div>;
  }

  return <>{children}</>;
}
