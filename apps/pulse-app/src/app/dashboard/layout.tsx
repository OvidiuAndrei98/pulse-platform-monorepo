"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";

export default function OrganizerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, isOrganizer } = useDataProvider();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isOrganizer)) {
      router.replace(user ? "/me" : "/login");
    }
  }, [loading, user, isOrganizer, router]);

  if (loading || !user || !isOrganizer) return null;

  return <>{children}</>;
}
