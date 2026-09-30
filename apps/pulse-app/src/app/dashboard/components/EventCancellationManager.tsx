"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { Event, EventCancellationRequest } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";

export function EventCancellationManager({ event, onRequested }: { event: Event; onRequested?: () => void }) {
  const { t } = useTranslation();
  const { user } = useDataProvider();
  const [request, setRequest] = useState<EventCancellationRequest>();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    void user.getEventCancellationRequest(event.id).then(setRequest).catch(() => undefined);
  }, [event.id, user]);

  const active = request && ["pending", "refunding", "failed"].includes(request.status);
  const canRequest = !active && ["published", "scheduled"].includes(event.status);

  const submit = async () => {
    if (!user || reason.trim().length < 10) return;
    setSubmitting(true);
    try {
      const created = await user.requestEventCancellation(event.id, reason.trim(), evidenceUrl.trim() || undefined);
      setRequest(created);
      onRequested?.();
      setOpen(false);
      toast.success(t("eventCancellation.requested"));
    } catch {
      toast.error(t("eventCancellation.requestFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!canRequest && !request) return null;

  return (
    <>
      <section className="mt-8 border-t border-white/10 pt-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t("eventCancellation.title")}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {active ? t(`eventCancellation.status.${request.status}`) : t("eventCancellation.description")}
            </p>
            {request?.adminNote && <p className="mt-3 rounded-xl bg-white/[0.04] p-3 text-sm text-muted-foreground">{request.adminNote}</p>}
            {request?.evidenceUrl && (
              <a href={request.evidenceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                {t("eventCancellation.evidence")} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
        {canRequest && (
          <button type="button" onClick={() => setOpen(true)} className="mt-5 h-11 w-full rounded-full border border-red-500/30 bg-red-500/10 text-sm font-semibold text-red-300 transition hover:bg-red-500/15">
            {t("eventCancellation.requestButton")}
          </button>
        )}
      </section>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-neutral-950 p-5 pb-[max(1.25rem,var(--native-safe-bottom))] sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t("eventCancellation.modalTitle")}</h2>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-white/10" aria-label={t("common.close")}><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("eventCancellation.modalDescription")}</p>
            <label className="mt-5 block text-xs font-semibold">
              {t("eventCancellation.reason")}
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} maxLength={4000} className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/[0.035] p-3 text-base outline-none focus:border-primary/50" />
            </label>
            <label className="mt-4 block text-xs font-semibold">
              {t("eventCancellation.evidenceUrl")}
              <input type="url" inputMode="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 text-base outline-none focus:border-primary/50" />
            </label>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={submitting} className="h-11 flex-1 rounded-full border border-white/10 text-sm font-semibold">{t("common.cancel")}</button>
              <button type="button" onClick={() => void submit()} disabled={submitting || reason.trim().length < 10} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-red-600 text-sm font-semibold text-white disabled:opacity-50">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{t("eventCancellation.submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
