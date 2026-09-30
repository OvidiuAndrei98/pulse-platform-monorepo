"use client";

import i18n from "@/i18n";
import { GlobalErrorScreen } from "@/components/GlobalErrorScreen";

// A global error replaces the root layout, including its fonts and CSS.
// Keep this screen self-contained so it still looks right when layout fails.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang={i18n.language}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body style={{ margin: 0, background: "#000" }}><GlobalErrorScreen onRetry={reset} /></body>
    </html>
  );
}
