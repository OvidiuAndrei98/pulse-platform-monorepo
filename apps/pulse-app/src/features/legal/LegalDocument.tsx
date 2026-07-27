"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export function LegalDocument({
  eyebrow,
  title,
  updatedAt,
  intro,
  sections,
  children,
}: {
  eyebrow: string;
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-5 pb-32 pt-12 text-foreground sm:px-7 sm:pt-16">
      <Link href="/" className="text-xs font-semibold text-primary transition hover:opacity-80">Glow</Link>
      <header className="mt-7 border-b border-white/10 pb-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">{intro}</p>
        <p className="mt-4 text-xs text-muted-foreground">{t("legal.lastUpdated", { date: updatedAt })}</p>
      </header>

      <article className="space-y-8 py-8">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph} className="mt-3 text-sm leading-6 text-muted-foreground">{paragraph}</p>)}
            {section.items && <ul className="mt-3 space-y-2 border-l border-primary/30 pl-4 text-sm leading-6 text-muted-foreground">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
          </section>
        ))}
      </article>

      <aside className="border border-amber-300/20 bg-amber-300/[0.04] p-4 text-xs leading-5 text-muted-foreground">
        {t("legal.disclaimer")}
      </aside>
      {children}
    </main>
  );
}
