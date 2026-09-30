"use client";

import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

export function RequestError({ onRetry, message, busy = false, className = "" }: {
  onRetry: () => void;
  message?: string;
  busy?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="alert" className={`rounded-2xl border border-white/10 bg-[#141414] p-4 text-sm ${className}`}>
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-white/75">{message ?? t("feedback.loadFailed")}</p>
      </div>
      <button type="button" onClick={onRetry} disabled={busy} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full px-3 font-semibold text-primary disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        {t(busy ? "common.loading" : "feedback.retry")}
      </button>
    </div>
  );
}

export function RequestProgress({ label, className = "" }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return <div role="status" className={`flex items-center gap-2 text-sm text-white/65 ${className}`}>
    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />{label ?? t("common.loading")}
  </div>;
}
