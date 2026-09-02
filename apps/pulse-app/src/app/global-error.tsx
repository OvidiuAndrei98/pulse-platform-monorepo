"use client";

import { useTranslation } from "react-i18next";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <html lang={i18n.language}>
      <body className="grid min-h-screen place-items-center bg-[#07100a] px-5 text-white">
        <main className="w-full max-w-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-lime-300">
            SPOTTR
          </p>
          <h1 className="mt-3 text-2xl font-semibold">{t("error.somethingWrong")}</h1>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-semibold text-[#07100a]"
          >
            {t("error.tryAgain")}
          </button>
        </main>
      </body>
    </html>
  );
}
