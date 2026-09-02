"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LegalDocument, type LegalSection } from "@/features/legal/LegalDocument";

type LegalDocumentKey = "terms" | "privacy" | "agreement";

type LegalDocumentCopy = {
  eyebrow: string;
  title: string;
  updatedAt: string;
  intro: string;
  sections: LegalSection[];
};

export function TranslatedLegalDocument({
  documentKey,
  children,
}: {
  documentKey: LegalDocumentKey;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const copy = t(`legalDocuments.${documentKey}`, {
    returnObjects: true,
  }) as unknown as LegalDocumentCopy;

  return <LegalDocument {...copy}>{children}</LegalDocument>;
}

export function OrganizerAgreementWebNotice() {
  const { t } = useTranslation();
  return (
    <main className="app-page-spacing mx-auto min-h-screen w-full max-w-3xl text-foreground">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">SPOTTR</p>
      <h1 className="mt-3 text-3xl font-semibold">
        {t("legalDocuments.agreement.webOnlyTitle")}
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
        {t("legalDocuments.agreement.webOnlyHint")}
      </p>
    </main>
  );
}
