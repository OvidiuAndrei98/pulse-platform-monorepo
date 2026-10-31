"use client";

import { Loader2 } from "lucide-react";
import {StatusNotice} from "./StatusNotice";
import { useTranslation } from "react-i18next";

export function RequestError({ onRetry, message, busy = false, className = "" }: {
  onRetry: () => void;
  message?: string;
  busy?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return <StatusNotice kind="error" title={message??t("feedback.loadFailed")} compact action={onRetry} actionLabel={t("feedback.retry")} busy={busy} className={`rounded-2xl border border-border bg-card ${className}`}/>;
}

export function RequestProgress({ label, className = "" }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return <div role="status" className={`flex items-center gap-2 text-sm text-white/65 ${className}`}>
    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />{label ?? t("common.loading")}
  </div>;
}
