"use client";

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { ApiClient } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";
import { TicketQrCode } from "@/components/tickets/TicketQrCode";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useTranslation } from "react-i18next";

export function ProfileConnectionQr() {
  const { user } = useDataProvider();
  const { t } = useTranslation();
  const [showCode, setShowCode] = useState(false);
  const [message, setMessage] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (!user) return null;
  const value = `glow://friend/${user.properties.id}`;
  const connect = async (scanned: string) => {
    const match = scanned.match(
      /^(?:glow|pulse):\/\/friend\/([0-9a-f-]{36})$/i,
    );
    if (!match) {
      setMessage(t("qr.invalidConnection"));
      return;
    }
    try {
      await ApiClient.instance.post("/friends/connect/{userId}", {
        params: { path: { userId: match[1] } },
      });
      setMessage(t("qr.connected"));
    } catch {
      setMessage(t("qr.connectionFailed"));
    }
  };

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      {/* Layout adaptativ vertical (flex-col) care trece pe orizontal doar pe ecrane mari (xl:flex-row) */}
      <div className="flex flex-col items-start gap-4 xl:flex-row xl:items-center xl:justify-between">
        {/* Container Iconita + Text */}
        <div className="flex items-start gap-3 text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <QrCode className="h-5 w-5 shrink-0" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-white leading-tight">
              {t("qr.quickConnect")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground leading-snug">
              {t("qr.showOrScan")}
            </p>
          </div>
        </div>

        {/* Butonul de actiune - ocupa latimea containerului in sidebar */}
        <button
          type="button"
          onClick={() => setShowCode(true)}
          className="flex h-9 w-full shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-xs font-semibold text-white transition-colors hover:bg-white/10 active:scale-95 xl:w-auto"
        >
          {t("qr.myCode")}
        </button>
      </div>

      {message && <p className="mt-3 text-xs text-primary">{message}</p>}

      {showCode && isDesktop ? (
        <div
          className="fixed inset-0 z-[120] hidden items-center justify-center bg-black/65 p-6 backdrop-blur-sm md:flex"
          onClick={() => setShowCode(false)}
        >
          <section
            className="w-full max-w-md rounded-xl border border-white/15 bg-[#101311] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-center text-base font-semibold">
              {t("qr.quickConnect")}
            </p>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              {t("qr.showOrScanOther")}
            </p>
            <ConnectionContent value={value} onScan={connect} />
          </section>
        </div>
      ) : showCode ? (
        <Drawer open={showCode} onOpenChange={setShowCode}>
          <DrawerContent className="max-h-[86svh] bg-[#101311]">
            <DrawerHeader>
              <DrawerTitle>{t("qr.quickConnect")}</DrawerTitle>
              <DrawerDescription>{t("qr.showOrScanOther")}</DrawerDescription>
            </DrawerHeader>
            <ConnectionContent value={value} onScan={connect} />
          </DrawerContent>
        </Drawer>
      ) : null}
    </section>
  );
}

function ConnectionContent({
  value,
  onScan,
}: {
  value: string;
  onScan: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-0 overflow-y-auto px-5 pb-7">
      <div className="mt-3 flex flex-col items-center gap-5">
        <div className="rounded-lg bg-white p-3">
          <TicketQrCode value={value} size={180} alt={t("qr.profileCode")} />
        </div>
        <div className="w-full">
          <QrCameraScanner onScan={(value) => void onScan(value)} />
        </div>
      </div>
    </div>
  );
}
