"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDataProvider } from "@/core/DataProviderContext";
import { PageLoadingState } from "@/components/ui/loading";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, isAdmin } = useDataProvider();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.replace(user ? "/me" : "/login");
    }
  }, [loading, user, isAdmin, router]);

  if (loading) return <PageLoadingState className="min-h-screen" />;
  if (!user || !isAdmin) return null;

  return <>{children}</>;
}
