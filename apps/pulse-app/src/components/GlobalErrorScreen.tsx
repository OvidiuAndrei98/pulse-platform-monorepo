"use client";

import { useTranslation } from "react-i18next";

// The global error replaces the root layout, so this screen brings its own CSS.
// The development preview uses the exact same component.
export function GlobalErrorScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();

  return (
    <>
      <style>{`
        .spottr-error-screen, .spottr-error-screen * { box-sizing: border-box; }
        .spottr-error-screen {
          position: fixed; inset: 0; z-index: 2147483647; display: grid;
          min-height: 100vh; min-height: 100dvh; place-items: center;
          overflow-y: auto; padding: max(32px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom));
          background: #000; color: #fff; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          -webkit-font-smoothing: antialiased; color-scheme: dark;
        }
        .spottr-error-content { width: min(100%, 420px); text-align: center; }
        .spottr-error-logo { display: block; width: min(56vw, 188px); height: auto; margin: 0 auto 46px; }
        .spottr-error-mark { display: block; width: 32px; height: 3px; margin: 0 auto 24px; border-radius: 99px; background: #ff0044; }
        .spottr-error-screen h1 { margin: 0; font-size: clamp(28px, 6vw, 38px); font-weight: 700; letter-spacing: -0.045em; line-height: 1.14; }
        .spottr-error-screen p { margin: 14px auto 0; max-width: 310px; color: #9e9e9e; font-size: 15px; line-height: 1.55; }
        .spottr-error-screen button { min-height: 48px; width: min(100%, 260px); margin-top: 34px; padding: 12px 24px; border: 0; border-radius: 999px; background: #ff0044; color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
        .spottr-error-screen button:hover { background: #e9003e; }
        .spottr-error-screen button:focus-visible { outline: 2px solid #fff; outline-offset: 4px; }
      `}</style>
      <main className="spottr-error-screen">
        <div className="spottr-error-content">
          <img className="spottr-error-logo" src="/spottr-logo-desktop.svg" alt="SPOTTR" width="1902" height="318" />
          <span className="spottr-error-mark" aria-hidden="true" />
          <h1>{t("error.somethingWrong")}</h1>
          <p>{t("error.explanation")}</p>
          <button type="button" onClick={onRetry}>{t("error.tryAgain")}</button>
        </div>
      </main>
    </>
  );
}
