"use client";

import { ChevronRight, Loader2, Megaphone, Percent, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Event, PromoCode } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { ManagementDrawer } from "./ManagementDrawer";
import {ActionButton as UIActionButton} from '@/components/ui/ActionButton';
import {Input as UIInput,Field as UIField} from '@/components/ui/Field';

export function PromoCodeManager({ event, readOnly = false }: { event: Event; readOnly?: boolean }) {
  const { t } = useTranslation();
  const { user } = useDataProvider();
  const [items, setItems] = useState<PromoCode[]>([]);
  const [code, setCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState(10);
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const reload = async () => {
    if (!user) return;
    try { setItems(await user.listPromoCodes(event.id)); } catch { setItems([]); }
  };
  useEffect(() => { void reload(); }, [event.id, user]);

  const create = async () => {
    if (!user || code.trim().length < 3) return;
    setBusy(true);
    try {
      await user.createPromoCode(event.id, {
        code: code.trim().toUpperCase(),
        discountPercent,
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined,
      });
      setCode(""); setMaxRedemptions(""); await reload(); toast.success(t("promoCodes.created"));
    } catch { toast.error(t("promoCodes.createFailed")); }
    finally { setBusy(false); }
  };

  const deactivate = async (item: PromoCode) => {
    if (!user) return;
    try { await user.deactivatePromoCode(event.id, item.id); setItems((old) => old.map((value) => value.id === item.id ? { ...value, active: false } : value)); toast.success(t("promoCodes.deactivated")); }
    catch { toast.error(t("promoCodes.deactivateFailed")); }
  };

  const activeCount = items.filter((item) => item.active).length;
  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 border-b border-white/10 py-5 text-left transition hover:bg-white/[0.025]"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary"><Megaphone className="h-[18px] w-[18px]" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t("promoCodes.title")}</span><span className="mt-0.5 block text-xs text-muted-foreground">{t("promoCodes.activeCount", { count: activeCount })}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
    <ManagementDrawer open={open} onClose={() => setOpen(false)} title={t("promoCodes.title")} subtitle={t(readOnly ? "promoCodes.readOnlySubtitle" : "promoCodes.subtitle")}>
      {!readOnly && <div className="grid grid-cols-2 gap-3"><UIField label={t("promoCodes.codeLabel")} className="col-span-2"><UIInput value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} maxLength={40} placeholder="CODPROMO" className="h-11 font-semibold uppercase" /></UIField><UIField label={t("promoCodes.discountLabel")}><div className="relative"><UIInput type="number" min={1} max={90} value={discountPercent} onChange={(event) => setDiscountPercent(Math.max(1, Math.min(90, Number(event.target.value))))} className="h-11 w-full pr-8" /><Percent className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></div></UIField><UIField label={t("promoCodes.limitLabel")}><UIInput type="number" min={1} value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.target.value)} placeholder={t("promoCodes.limitPlaceholder")} className="h-11" /></UIField><UIActionButton type="button" disabled={busy || code.length < 3} onClick={() => void create()} className="col-span-2 h-11 px-4 text-sm font-semibold disabled:opacity-40">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : t("promoCodes.create")}</UIActionButton></div>}
      <div className={`${readOnly ? "" : "mt-5"} divide-y divide-white/10`}>{items.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold tracking-wide">{item.code} <span className="ml-2 text-primary">-{item.discountPercent}%</span></p><p className="mt-1 text-xs text-muted-foreground">{item.redemptionsCount}{item.maxRedemptions ? ` / ${item.maxRedemptions}` : ""} {t("promoCodes.uses")} · {t(item.active ? "promoCodes.active" : "promoCodes.inactive")}</p></div>{item.active && !readOnly && <button type="button" aria-label={t("promoCodes.deactivate")} onClick={() => void deactivate(item)} className="grid h-9 w-9 place-items-center rounded-full text-red-400 hover:bg-red-500/10"><XCircle className="h-4 w-4" /></button>}</div>)}</div>
      {items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t("promoCodes.empty")}</p>}
    </ManagementDrawer>
  </>;
}
