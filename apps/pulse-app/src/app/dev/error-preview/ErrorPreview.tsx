"use client";

import { GlobalErrorScreen } from "@/components/GlobalErrorScreen";

export function ErrorPreview() {
  return <GlobalErrorScreen onRetry={() => window.location.assign("/")} />;
}
