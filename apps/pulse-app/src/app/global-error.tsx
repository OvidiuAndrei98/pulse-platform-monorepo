"use client";

import i18n from "@/i18n";
import { useTranslation } from "react-i18next";

// A global error replaces the root layout, including its fonts and CSS.
// Keep this screen self-contained so it still looks right when layout fails.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  return (
    <html lang={i18n.language}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
        <style>{`
          * { box-sizing: border-box; }
          html { color-scheme: dark; background: #000; }
          body { margin: 0; background: #000; color: #fff; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
          main { display: grid; min-height: 100vh; min-height: 100dvh; place-items: center; padding: max(32px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom)); }
          .error-content { width: min(100%, 420px); text-align: center; }
          .error-logo { display: block; width: min(56vw, 188px); height: auto; margin: 0 auto 46px; }
          .error-mark { display: block; width: 32px; height: 3px; margin: 0 auto 24px; border-radius: 99px; background: #ff0044; }
          h1 { margin: 0; font-size: clamp(28px, 6vw, 38px); font-weight: 700; letter-spacing: -0.045em; line-height: 1.14; }
          p { margin: 14px auto 0; max-width: 310px; color: #9e9e9e; font-size: 15px; line-height: 1.55; }
          button { min-height: 48px; width: min(100%, 260px); margin-top: 34px; padding: 12px 24px; border: 0; border-radius: 999px; background: #ff0044; color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
          button:hover { background: #e9003e; }
          button:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
        `}</style>
      </head>
      <body>
        <main>
          <div className="error-content">
            <img className="error-logo" src="/spottr-logo-desktop.svg" alt="SPOTTR" width="1902" height="318" />
            <span className="error-mark" aria-hidden="true" />
            <h1>{t("error.somethingWrong")}</h1>
            <p>{t("error.explanation")}</p>
            <button type="button" onClick={reset}>{t("error.tryAgain")}</button>
          </div>
        </main>
      </body>
    </html>
  );
}
