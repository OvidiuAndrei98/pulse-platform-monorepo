"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronLeft, MapPin, Receipt } from "lucide-react";
import { ApiClient, type ReadableSchema } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";

type UserOrder = ReadableSchema<"UserOrderResponse">;

const statusLabel: Record<string, string> = { completed: "Platita", pending: "In asteptare", canceled: "Anulata", refunded: "Rambursata" };

export default function InvoicesPage() {
  const { user, loading } = useDataProvider();
  const router = useRouter();
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  useEffect(() => {
    if (!user) return;
    ApiClient.instance.get("/users/me/orders")
      .then((response) => setOrders(response as UserOrder[]))
      .catch(() => setOrders([]))
      .finally(() => setPending(false));
  }, [user]);

  return <main className="mx-auto min-h-screen max-w-3xl px-5 pb-32 pt-10 text-foreground sm:px-7"><Link href="/users/me" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary"><ChevronLeft className="h-4 w-4" /> Profil</Link><div className="mt-5"><h1 className="text-2xl font-semibold">Facturi si comenzi</h1><p className="mt-1 text-sm text-muted-foreground">Istoricul platilor pentru biletele tale</p></div>{pending ? <div className="mt-7 h-48 animate-pulse border border-white/10 bg-white/[0.03]" /> : orders.length === 0 ? <div className="mt-7 border border-dashed border-white/15 px-5 py-12 text-center"><Receipt className="mx-auto h-6 w-6 text-primary" /><p className="mt-3 text-sm font-semibold">Nu ai comenzi inca.</p><p className="mt-1 text-xs text-muted-foreground">Platile pentru bilete vor aparea aici.</p></div> : <div className="mt-7 divide-y divide-white/10 border-y border-white/10">{orders.map((order) => <article key={order.id} className="flex gap-3 py-4"><span className="grid h-10 w-10 shrink-0 place-items-center bg-primary/10 text-primary"><Receipt className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{order.eventTitle}</p><p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {new Date(order.createdAt).toLocaleDateString("ro-RO", { day: "numeric", month: "short", year: "numeric" })}</span><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {order.locationName}</span></p><p className="mt-1 font-mono text-[10px] text-muted-foreground">Comanda {order.id}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold">{order.totalAmountRon} RON</p><p className="mt-1 text-[11px] text-muted-foreground">{statusLabel[order.status] ?? order.status}</p></div></article>)}</div>}</main>;
}
