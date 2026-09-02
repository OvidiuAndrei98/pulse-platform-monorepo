import { Suspense } from "react";
import { AgreementAcceptance } from "@/components/organizer/AgreementAcceptance";
import {
  OrganizerAgreementWebNotice,
  TranslatedLegalDocument,
} from "@/features/legal/TranslatedLegalDocument";

export default function OrganizerAgreementPage() {
  if (process.env.CAPACITOR_BUILD === "true") {
    return <OrganizerAgreementWebNotice />;
  }

  return (
    <TranslatedLegalDocument documentKey="agreement">
      <Suspense
        fallback={
          <div className="mt-8 h-24 animate-pulse border border-white/10 bg-white/[0.03]" />
        }
      >
        <AgreementAcceptance />
      </Suspense>
    </TranslatedLegalDocument>
  );
}
