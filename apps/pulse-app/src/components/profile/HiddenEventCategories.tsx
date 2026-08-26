"use client";

import { EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { eventCategories } from "@/core/mappers";
import { useDataProvider } from "@/core/DataProviderContext";

export function HiddenEventCategories() {
  const { user } = useDataProvider();
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => { if (user) user.listHiddenCategories().then(setHidden).catch(() => setHidden([])); }, [user]);
  const toggle = async (category: string) => {
    if (!user) return;
    if (hidden.includes(category)) { await user.showEventCategory(category); setHidden((old) => old.filter((item) => item !== category)); }
    else { await user.hideEventCategory(category); setHidden((old) => [...old, category]); }
  };
  return <section className="rounded-[26px] border border-white/10 bg-white/[0.035] p-4"><div className="flex items-center gap-2"><EyeOff className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Categorii ascunse</h2></div><p className="mt-1 text-xs leading-5 text-muted-foreground">Evenimentele din categoriile selectate nu vor mai apărea în recomandări sau căutare.</p><div className="mt-4 flex flex-wrap gap-2">{eventCategories.map((category) => { const active = hidden.includes(category); return <button type="button" key={category} onClick={() => void toggle(category)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${active ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:border-white/25"}`}>{category}</button>; })}</div></section>;
}
