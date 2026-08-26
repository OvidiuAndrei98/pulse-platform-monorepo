"use client";

import { ChevronRight, Copy, Gift, Loader2, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TicketQrCode } from "@/components/tickets/TicketQrCode";
import type { Event, InvitationTicket } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";
import { ManagementDrawer } from "./ManagementDrawer";
import { ThemedSelect } from "@/features/events/form/ThemedSelect";

export function InvitationManager({ event, readOnly = false }: { event: Event; readOnly?: boolean }) {
  const { user } = useDataProvider();
  const [items, setItems] = useState<InvitationTicket[]>([]);
  const [label, setLabel] = useState("");
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [selected, setSelected] = useState<InvitationTicket>();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => { if (user) user.listInvitations(event.id).then(setItems).catch(() => setItems([])); }, [event.id, user]);

  const create = async () => {
    if (!user || !label.trim()) return;
    setBusy(true);
    try {
      const item = await user.createInvitation(event.id, { label: label.trim(), ticketTypeId: ticketTypeId || undefined });
      setItems((old) => [item, ...old]); setSelected(item); setLabel(""); toast.success("Invitație generată");
    } catch { toast.error("Invitația nu a putut fi generată"); } finally { setBusy(false); }
  };
  const revoke = async (item: InvitationTicket) => {
    if (!user) return;
    try { await user.revokeInvitation(event.id, item.id); setItems((old) => old.map((current) => current.id === item.id ? { ...current, status: "revoked" } : current)); toast.success("Invitație anulată"); }
    catch { toast.error("Invitația nu poate fi anulată"); }
  };
  const remove = async (item: InvitationTicket) => {
    if (!user) return;
    try { await user.deleteInvitation(event.id, item.id); setItems((old) => old.filter((current) => current.id !== item.id)); if (selected?.id === item.id) setSelected(undefined); toast.success("Invitație ștearsă"); }
    catch { toast.error("Invitația nu poate fi ștearsă"); }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-left transition hover:border-white/20 hover:bg-white/[0.05]"><span className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary"><Gift className="h-[18px] w-[18px]" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Invitații</span><span className="mt-0.5 block text-xs text-muted-foreground">{items.length} {items.length === 1 ? "invitație" : "invitații"}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
    <ManagementDrawer open={open} onClose={() => setOpen(false)} title="Invitații" subtitle={readOnly ? "Invitațiile evenimentului încheiat sunt disponibile doar pentru consultare." : "Generează bilete de invitație și urmărește starea lor."}>
      {!readOnly && <div className="grid gap-3"><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nume sau etichetă" className="h-11 rounded-xl border border-white/10 bg-black/20 px-3 text-sm outline-none focus:border-primary/50" /><ThemedSelect value={ticketTypeId} onChange={setTicketTypeId} placeholder="Alege tipul invitației" icon={Gift} options={[{ value: "", label: "Invitație generală" }, ...event.ticketTypes.map((type) => ({ value: type.id, label: type.name }))]} /><button type="button" disabled={busy || !label.trim()} onClick={() => void create()} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Generează"}</button></div>}
      {selected && <div className="mt-5 flex flex-col items-center rounded-2xl bg-white p-4 text-black"><TicketQrCode value={selected.validationHash} size={190} /><p className="mt-2 font-semibold">{selected.label}</p><button type="button" onClick={() => void navigator.clipboard.writeText(selected.validationHash)} className="mt-2 inline-flex items-center gap-1 text-xs"><Copy className="h-3.5 w-3.5" /> Copiază codul</button></div>}
      <div className={`${readOnly ? "" : "mt-5"} divide-y divide-white/10`}>{items.map((item) => <div key={item.id} className="flex items-center gap-3 py-3"><button type="button" onClick={() => setSelected(item)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.ticketType || "Invitație generală"} · {item.status}</p></button>{item.status === "active" && !readOnly && <button type="button" aria-label="Anulează invitația" onClick={() => void revoke(item)} className="grid h-9 w-9 place-items-center rounded-full text-red-400 hover:bg-red-500/10"><XCircle className="h-4 w-4" /></button>}{item.status === "revoked" && !readOnly && <button type="button" aria-label="Șterge invitația" onClick={() => void remove(item)} className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>}</div>)}</div>
      {items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nu există invitații generate.</p>}
    </ManagementDrawer>
  </>;
}
