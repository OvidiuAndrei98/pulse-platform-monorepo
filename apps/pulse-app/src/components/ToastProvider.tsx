"use client";

import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import { Toaster } from "sonner";

export function ToastProvider() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <Toaster
      className="spottr-toaster"
      position="top-right"
      theme="dark"
      visibleToasts={3}
      gap={10}
      swipeDirections={["top", "right"]}
      offset={{ top: 84, right: 24 }}
      mobileOffset={{
        top: "calc(max(env(safe-area-inset-top, 0px), var(--native-safe-top, 0px)) + 12px)",
        left: 16,
        right: 16,
      }}
      icons={{
        success: <CircleCheck aria-hidden="true" />,
        error: <CircleAlert aria-hidden="true" />,
        info: <Info aria-hidden="true" />,
        warning: <TriangleAlert aria-hidden="true" />,
        loading: <LoaderCircle aria-hidden="true" className="animate-spin" />,
      }}
      toastOptions={{
        className: "spottr-toast",
      }}
    />
  );
}
