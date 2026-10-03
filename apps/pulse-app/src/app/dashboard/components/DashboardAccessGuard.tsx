"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { useTranslation } from "react-i18next";
import { PageLoadingState } from "@/components/ui/loading";
import { hasPreparedOfflineValidationForUser } from "@/features/tickets/offlineValidationStore";
import { ApiError } from "@packages/api-client/src/Client";

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
      .then(async (events) => {
        const prepared = !events.length && await hasPreparedOfflineValidationForUser(user.properties.id).catch(() => false);
        if (cancelled) return;
        if (!events.length && !prepared) {
          router.replace("/users/me");
          return;
        }
        if (!pathname.startsWith("/dashboard/ticket-validation")) {
          router.replace("/dashboard/ticket-validation");
          return;
        }
        setCheckingAccess(false);
      })
      .catch(async (error) => {
        const denied = error instanceof ApiError && error.status >= 400 && error.status < 500;
        const prepared = !denied && await hasPreparedOfflineValidationForUser(user.properties.id).catch(() => false);
        if (cancelled) return;
        if (prepared && pathname.startsWith("/dashboard/ticket-validation")) setCheckingAccess(false);
        else if (prepared) router.replace("/dashboard/ticket-validation");
        else router.replace("/users/me");
      });

    return () => {
      cancelled = true;
    };
  }, [isOrganizer, loading, pathname, router, user]);

  if (loading || checkingAccess) {
    return <PageLoadingState label={t("dashboardNav.checkingAccess")} className="min-h-screen" />;
  }

  return <>{children}</>;
}
