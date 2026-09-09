"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

export function ToastProvider() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <Toaster
      position="bottom-center"
      theme="dark"
      closeButton
      visibleToasts={3}
      offset={{ bottom: 24 }}
      mobileOffset={{
        bottom: "calc(var(--native-safe-bottom, 0px) + 7rem)",
        left: 16,
        right: 16,
      }}
      toastOptions={{
        className:
          "border border-white/15 bg-[#101311] text-foreground shadow-2xl",
      }}
    />
  );
}
