"use client";

import { useBackLayer } from "@/lib/navigation/useBackLayer";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { QrCode } from "lucide-react";
import { ApiClient, ApiError } from "@packages/api-client/src/Client";
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
  useBackLayer(showCode, () => setShowCode(false));
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
    setMessage("");
    const match = scanned.match(
      /^(?:glow|pulse):\/\/friend\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
    );
    if (!match) {
      setMessage(t("qr.invalidConnection"));
      return;
    }
    if (match[1].toLowerCase() === user.properties.id.toLowerCase()) {
      setMessage(t("qr.ownCode"));
      return;
    }
    try {
      await ApiClient.instance.post("/friends/connect/{userId}", {
        params: { path: { userId: match[1] } },
      });
      setMessage(t("qr.connected"));
    } catch (error) {
      setMessage(error instanceof ApiError
        ? t(error.status === 401 ? "qr.sessionExpired" : "qr.connectionRejected", { status: error.status })
        : t("qr.connectionOffline"));
    }
  };

  return (
    <section className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
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
          onClick={() => { setMessage(""); setShowCode(true); }}
          className="flex h-9 w-full shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-xs font-semibold text-white transition-colors hover:bg-white/10 active:scale-95 xl:w-auto"
        >
          {t("qr.myCode")}
        </button>
      </div>

      {message && <p className="mt-3 text-xs text-primary">{message}</p>}

      {isDesktop ? (showCode && createPortal(
        <div
          className="fixed inset-0 z-[120] hidden items-center justify-center bg-black/65 p-6 backdrop-blur-sm md:flex"
          onClick={() => setShowCode(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={t("qr.quickConnect")}
            className="max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto rounded-xl border border-white/15 bg-[#101311] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-center text-base font-semibold">
              {t("qr.quickConnect")}
            </p>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              {t("qr.showOrScanOther")}
            </p>
            <ConnectionContent value={value} onScan={connect} message={message} onStart={() => setMessage("")} />
          </section>
        </div>, document.body
      )) : (
        <Drawer historyBack={false} open={showCode} onOpenChange={setShowCode} shouldScaleBackground={false}>
          <DrawerContent className="max-h-[min(80dvh,42rem)] bg-[#101311]">
            <DrawerHeader>
              <DrawerTitle>{t("qr.quickConnect")}</DrawerTitle>
              <DrawerDescription>{t("qr.showOrScanOther")}</DrawerDescription>
            </DrawerHeader>
            {showCode && <ConnectionContent value={value} onScan={connect} message={message} onStart={() => setMessage("")} />}
          </DrawerContent>
        </Drawer>
      )}
    </section>
  );
}

function ConnectionContent({
  value,
  onScan,
  message,
  onStart,
}: {
  value: string;
  onScan: (value: string) => Promise<void>;
  message: string;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"code" | "scan">("code");
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div role="group" aria-label={t("qr.quickConnect")} className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-white/5 p-1">
        {(["code", "scan"] as const).map(item => (
          <button key={item} type="button" aria-pressed={mode === item} onClick={() => { onStart(); setMode(item); }}
            className={`min-h-11 rounded-full px-3 text-sm font-semibold ${mode === item ? "bg-primary text-white" : "text-muted-foreground"}`}>
            {t(item === "code" ? "qr.myCode" : "qr.scanQr")}
          </button>
        ))}
      </div>
      {mode === "code" ? (
        <div className="mx-auto mb-3 w-fit rounded-xl bg-white p-3">
          <TicketQrCode value={value} size={180} alt={t("qr.profileCode")} />
        </div>
      ) : <QrCameraScanner onScan={onScan} onStart={onStart} className="w-full" />}
      {message && <p role="status" className="mt-4 text-center text-sm text-primary">{message}</p>}
    </div>
  );
}
