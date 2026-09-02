"use client";

import { Ban, ChevronDown, ChevronRight, Download, Gift, Loader2, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { createInvitationBatchPdf, downloadPdfBlob } from "@/components/tickets/invitationBatchPdf";
import type { Event, InvitationTicket } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { ThemedSelect } from "@/features/events/form/ThemedSelect";
import { ManagementDrawer } from "./ManagementDrawer";

type InvitationBatch = {
  id: string;
  label: string;
  ticketType: string;
  items: InvitationTicket[];
};

function normalizeQuantity(value: string) {
  return Math.min(100, Math.max(1, Number.parseInt(value, 10) || 1));
}

export function InvitationManager({ event, readOnly = false }: { event: Event; readOnly?: boolean }) {
  const { t } = useTranslation();
  const { user } = useDataProvider();
  const [items, setItems] = useState<InvitationTicket[]>([]);
  const [label, setLabel] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [busy, setBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState<string>();
  const [expandedBatch, setExpandedBatch] = useState<string>();
  const [open, setOpen] = useState(false);
  const quantity = normalizeQuantity(quantityInput);

  useEffect(() => {
    if (user) user.listInvitations(event.id).then(setItems).catch(() => setItems([]));
  }, [event.id, user]);

  const batches = useMemo(() => {
    const grouped = new Map<string, InvitationBatch>();
    items.forEach((item) => {
      const existing = grouped.get(item.batchId);
      if (existing) existing.items.push(item);
      else grouped.set(item.batchId, {
        id: item.batchId,
        label: item.label,
        ticketType: item.ticketType || t("invitations.general"),
        items: [item],
      });
    });
    return Array.from(grouped.values()).map((batch) => ({
      ...batch,
      items: batch.items.sort((a, b) => a.batchIndex - b.batchIndex),
    }));
  }, [items, t]);

  const create = async () => {
    if (!user || !label.trim()) return;
    setBusy(true);
    try {
      const created = await user.createInvitation(event.id, {
        label: label.trim(),
        ticketTypeId: ticketTypeId || undefined,
        quantity,
      });
      setItems((old) => [...created, ...old]);
      setExpandedBatch(created[0]?.batchId);
      setLabel("");
      setQuantityInput("1");
      toast.success(t("invitations.generated", { count: created.length }));
    } catch {
      toast.error(t("invitations.generateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const pdfCopy = () => ({
    invitation: t("invitations.general"),
    dateAndTime: t("ticketPdf.dateAndTime"),
    location: t("ticketPdf.location"),
    ticketCode: t("ticketPdf.ticketCode"),
    validationHint: t("ticketPdf.validationHint"),
  });

  const downloadBatch = async (batch: InvitationBatch) => {
    setBatchBusy(batch.id);
    try {
      const pdf = await createInvitationBatchPdf(event, batch.items, pdfCopy());
      downloadPdfBlob(pdf.blob, pdf.fileName);
      toast.success(t("invitations.downloaded", { count: pdf.count }));
    } catch {
      toast.error(t("invitations.pdfFailed"));
    } finally {
      setBatchBusy(undefined);
    }
  };

  const shareBatch = async (batch: InvitationBatch) => {
    setBatchBusy(batch.id);
    try {
      const pdf = await createInvitationBatchPdf(event, batch.items, pdfCopy());
      const file = new File([pdf.blob], pdf.fileName, { type: "application/pdf" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: batch.label, text: event.title, files: [file] });
      } else {
        downloadPdfBlob(pdf.blob, pdf.fileName);
        toast.info(t("invitations.shareFallback"));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(t("invitations.shareFailed"));
    } finally {
      setBatchBusy(undefined);
    }
  };

  const revokeBatch = async (batch: InvitationBatch) => {
    if (!user) return;
    const active = batch.items.filter((item) => item.status === "active");
    setBatchBusy(batch.id);
    try {
      await Promise.all(active.map((item) => user.revokeInvitation(event.id, item.id)));
      const revokedIds = new Set(active.map((item) => item.id));
      setItems((old) => old.map((item) => revokedIds.has(item.id) ? { ...item, status: "revoked" } : item));
      toast.success(t("invitations.revoked", { count: active.length }));
    } catch {
      await user.listInvitations(event.id).then(setItems).catch(() => undefined);
      toast.error(t("invitations.revokeFailed"));
    } finally {
      setBatchBusy(undefined);
    }
  };

  const removeBatch = async (batch: InvitationBatch) => {
    if (!user) return;
    const revoked = batch.items.filter((item) => item.status === "revoked");
    setBatchBusy(batch.id);
    try {
      await Promise.all(revoked.map((item) => user.deleteInvitation(event.id, item.id)));
      const removedIds = new Set(revoked.map((item) => item.id));
      setItems((old) => old.filter((item) => !removedIds.has(item.id)));
      toast.success(t("invitations.removed", { count: revoked.length }));
    } catch {
      await user.listInvitations(event.id).then(setItems).catch(() => undefined);
      toast.error(t("invitations.removeFailed"));
    } finally {
      setBatchBusy(undefined);
    }
  };

  const revokeOne = async (batch: InvitationBatch, item: InvitationTicket) => {
    if (!user) return;
    setBatchBusy(batch.id);
    try {
      await user.revokeInvitation(event.id, item.id);
      setItems((old) => old.map((current) => current.id === item.id ? { ...current, status: "revoked" } : current));
      toast.success(t("invitations.revoked", { count: 1 }));
    } catch {
      toast.error(t("invitations.revokeFailed"));
    } finally {
      setBatchBusy(undefined);
    }
  };

  const removeOne = async (batch: InvitationBatch, item: InvitationTicket) => {
    if (!user) return;
    setBatchBusy(batch.id);
    try {
      await user.deleteInvitation(event.id, item.id);
      setItems((old) => old.filter((current) => current.id !== item.id));
      toast.success(t("invitations.removed", { count: 1 }));
    } catch {
      toast.error(t("invitations.removeFailed"));
    } finally {
      setBatchBusy(undefined);
    }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05]">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary"><Gift className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t("invitations.title")}</span><span className="mt-0.5 block text-xs text-muted-foreground">{t("invitations.count", { count: items.length })}</span></span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
    <ManagementDrawer open={open} onClose={() => setOpen(false)} title={t("invitations.title")} subtitle={t(readOnly ? "invitations.readOnlySubtitle" : "invitations.subtitle")}>
      {!readOnly && <div className="grid gap-3">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("invitations.labelPlaceholder")} maxLength={120} className="h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-primary/50" />
        <ThemedSelect value={ticketTypeId} onChange={setTicketTypeId} placeholder={t("invitations.typePlaceholder")} icon={Gift} options={[{ value: "", label: t("invitations.general") }, ...event.ticketTypes.map((type) => ({ value: type.id, label: type.name }))]} />
        <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
          {t("invitations.quantity")}
          <input type="number" inputMode="numeric" min={1} max={100} value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} onBlur={() => setQuantityInput(String(quantity))} className="h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-foreground outline-none focus:border-primary/50" />
          <span className="font-normal">{t("invitations.quantityHint")}</span>
        </label>
        <button type="button" disabled={busy || !label.trim()} onClick={() => void create()} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("invitations.generate", { count: quantity })}
        </button>
      </div>}

      <div className={readOnly ? "grid gap-3" : "mt-5 grid gap-3"}>
        {batches.map((batch) => {
          const activeCount = batch.items.filter((item) => item.status === "active").length;
          const usedCount = batch.items.filter((item) => item.status === "used").length;
          const revokedCount = batch.items.filter((item) => item.status === "revoked").length;
          const isExpanded = expandedBatch === batch.id;
          const isBusy = batchBusy === batch.id;
          return <article key={batch.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
            <button type="button" onClick={() => setExpandedBatch(isExpanded ? undefined : batch.id)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.035]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Gift className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{batch.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{batch.ticketType} · {t("invitations.batchCount", { count: batch.items.length })}</span>
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${isExpanded ? "rotate-180" : ""}`} />
            </button>
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-white/10 px-4 py-2.5 text-[11px] text-muted-foreground">
              <span className="text-emerald-400">{t("invitations.statusCount.active", { count: activeCount })}</span>
              {usedCount > 0 && <span>{t("invitations.statusCount.used", { count: usedCount })}</span>}
              {revokedCount > 0 && <span className="text-red-400">{t("invitations.statusCount.revoked", { count: revokedCount })}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-3">
              <button type="button" disabled={isBusy || activeCount === 0} onClick={() => void shareBatch(batch)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-35"><Share2 className="h-4 w-4" />{t("invitations.share")}</button>
              <button type="button" disabled={isBusy || activeCount === 0} onClick={() => void downloadBatch(batch)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold transition hover:bg-white/10 disabled:opacity-35">{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{t("invitations.downloadPdf")}</button>
              {!readOnly && activeCount > 0 && <button type="button" disabled={isBusy} onClick={() => void revokeBatch(batch)} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-35"><Ban className="h-4 w-4" />{t("invitations.revokeBatch", { count: activeCount })}</button>}
              {!readOnly && activeCount === 0 && revokedCount > 0 && <button type="button" disabled={isBusy} onClick={() => void removeBatch(batch)} className="col-span-2 inline-flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-35"><Trash2 className="h-4 w-4" />{t("invitations.removeBatch", { count: revokedCount })}</button>}
            </div>
            {isExpanded && <div className="divide-y divide-white/10 border-t border-white/10 px-4">
              {batch.items.map((item) => <div key={item.id} className="flex items-center gap-3 py-2 text-xs">
                <span className="font-medium">#{item.batchIndex}</span>
                <span className={`min-w-0 flex-1 text-right ${item.status === "active" ? "text-emerald-400" : item.status === "revoked" ? "text-red-400" : "text-muted-foreground"}`}>{t(`invitations.status.${item.status}`)}</span>
                {!readOnly && item.status === "active" && <button type="button" disabled={isBusy} aria-label={t("invitations.revoke")} onClick={() => void revokeOne(batch, item)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-red-400 transition hover:bg-red-500/10 disabled:opacity-35"><Ban className="h-3.5 w-3.5" /></button>}
                {!readOnly && item.status === "revoked" && <button type="button" disabled={isBusy} aria-label={t("invitations.remove")} onClick={() => void removeOne(batch, item)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-35"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>)}
            </div>}
          </article>;
        })}
      </div>
      {items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("invitations.empty")}</p>}
    </ManagementDrawer>
  </>;
}
