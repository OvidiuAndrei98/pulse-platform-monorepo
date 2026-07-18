"use client";

import { BottomNav } from "@/components/BottomNav";
import Pager from "@/components/Pager";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <Pager />
      <BottomNav />
    </div>
  );
}
