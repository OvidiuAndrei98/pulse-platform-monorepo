"use client";

import { ChevronRight, Loader2, Megaphone, Percent, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Event, PromoCode } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { ManagementDrawer } from "./ManagementDrawer";

export function PromoCodeManager({ event, readOnly = false }: { event: Event; readOnly?: boolean }) {
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
      setCode(""); setMaxRedemptions(""); await reload(); toast.success("Cod promo creat");
    } catch { toast.error("Codul promo nu a putut fi creat"); }
    finally { setBusy(false); }
  };

  const deactivate = async (item: PromoCode) => {
    if (!user) return;
    try { await user.deactivatePromoCode(event.id, item.id); setItems((old) => old.map((value) => value.id === item.id ? { ...value, active: false } : value)); toast.success("Cod promo dezactivat"); }
    catch { toast.error("Codul nu a putut fi dezactivat"); }
  };

  const activeCount = items.filter((item) => item.active).length;
  return <>
    <button type="button" onClick={() => setOpen(true)} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05]"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary"><Megaphone className="h-[18px] w-[18px]" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">PR & coduri promo</span><span className="mt-0.5 block text-xs text-muted-foreground">{activeCount} {activeCount === 1 ? "cod activ" : "coduri active"}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
    <ManagementDrawer open={open} onClose={() => setOpen(false)} title="PR & coduri promo" subtitle={readOnly ? "Codurile evenimentului încheiat sunt disponibile doar pentru consultare." : "Creează și urmărește codurile promoționale ale evenimentului."}>
      {!readOnly && <div className="grid grid-cols-2 gap-3"><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} maxLength={40} placeholder="CODPROMO" className="col-span-2 h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-semibold uppercase outline-none focus:border-primary/50" /><label className="relative"><input type="number" min={1} max={90} value={discountPercent} onChange={(event) => setDiscountPercent(Math.max(1, Math.min(90, Number(event.target.value))))} className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 pr-8 text-sm outline-none" /><Percent className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></label><input type="number" min={1} value={maxRedemptions} onChange={(event) => setMaxRedemptions(event.target.value)} placeholder="Limită" className="h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none" /><button type="button" disabled={busy || code.length < 3} onClick={() => void create()} className="col-span-2 h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Creează"}</button></div>}
      <div className={`${readOnly ? "" : "mt-5"} divide-y divide-white/10`}>{items.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold tracking-wide">{item.code} <span className="ml-2 text-primary">-{item.discountPercent}%</span></p><p className="mt-1 text-xs text-muted-foreground">{item.redemptionsCount}{item.maxRedemptions ? ` / ${item.maxRedemptions}` : ""} utilizări · {item.active ? "activ" : "inactiv"}</p></div>{item.active && !readOnly && <button type="button" aria-label="Dezactivează codul" onClick={() => void deactivate(item)} className="grid h-9 w-9 place-items-center rounded-full text-red-400 hover:bg-red-500/10"><XCircle className="h-4 w-4" /></button>}</div>)}</div>
      {items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nu există coduri promo create.</p>}
    </ManagementDrawer>
  </>;
}
