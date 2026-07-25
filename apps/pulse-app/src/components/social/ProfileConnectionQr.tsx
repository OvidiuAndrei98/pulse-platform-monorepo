"use client";

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { ApiClient } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";
import { TicketQrCode } from "@/components/tickets/TicketQrCode";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export function ProfileConnectionQr() {
  const { user } = useDataProvider();
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
  const value = `pulse://friend/${user.properties.id}`;
  const connect = async (scanned: string) => {
    const match = scanned.match(/^pulse:\/\/friend\/([0-9a-f-]{36})$/i);
    if (!match) {
      setMessage("Acesta nu este un cod Pulse pentru conectare.");
      return;
    }
    try {
      await ApiClient.instance.post("/friends/connect/{userId}", { params: { path: { userId: match[1] } } });
      setMessage("Sunteti acum prieteni.");
    } catch {
      setMessage("Conectarea nu a putut fi realizata.");
    }
  };

  return (
    <section className="border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex min-w-0 items-center justify-center gap-2.5"><QrCode className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-sm font-semibold">Conecteaza-te rapid</p><p className="text-xs text-muted-foreground">Arata sau scaneaza codul de profil.</p></div></div>
        <button type="button" onClick={() => setShowCode(true)} className="h-9 w-full max-w-56 shrink-0 rounded-full border border-white/15 px-3 text-xs font-semibold">Codul meu</button>
      </div>
      {message && <p className="mt-3 text-xs text-primary">{message}</p>}
      {showCode && isDesktop ? (
        <div className="fixed inset-0 z-[120] hidden items-center justify-center bg-black/65 p-6 backdrop-blur-sm md:flex" onClick={() => setShowCode(false)}>
          <section className="w-full max-w-md rounded-xl border border-white/15 bg-[#101311] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <p className="text-center text-base font-semibold">Conecteaza-te rapid</p>
            <p className="mt-1 text-center text-sm text-muted-foreground">Arata codul sau scaneaza codul altei persoane.</p>
            <ConnectionContent value={value} onScan={connect} />
          </section>
        </div>
      ) : showCode ? (
        <Drawer open={showCode} onOpenChange={setShowCode}>
          <DrawerContent className="max-h-[86svh] bg-[#101311]">
            <DrawerHeader><DrawerTitle>Conecteaza-te rapid</DrawerTitle><DrawerDescription>Arata codul sau scaneaza codul altei persoane.</DrawerDescription></DrawerHeader>
            <ConnectionContent value={value} onScan={connect} />
          </DrawerContent>
        </Drawer>
      ) : null}
    </section>
  );
}

function ConnectionContent({ value, onScan }: { value: string; onScan: (value: string) => Promise<void> }) {
  return <div className="min-h-0 overflow-y-auto px-5 pb-7"><div className="mt-3 flex flex-col items-center gap-5"><div className="rounded-lg bg-white p-3"><TicketQrCode value={value} size={180} alt="Cod QR profil Pulse" /></div><div className="w-full"><QrCameraScanner onScan={(value) => void onScan(value)} /></div></div></div>;
}
