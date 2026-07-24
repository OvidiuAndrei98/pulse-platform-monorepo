"use client";

import { useState } from "react";
import { QrCode } from "lucide-react";
import { ApiClient } from "@packages/api-client/src/Client";
import { useDataProvider } from "@/core/DataProviderContext";
import { QrCameraScanner } from "@/components/tickets/QrCameraScanner";
import { TicketQrCode } from "@/components/tickets/TicketQrCode";

export function ProfileConnectionQr() {
  const { user } = useDataProvider();
  const [showCode, setShowCode] = useState(false);
  const [message, setMessage] = useState("");

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5"><QrCode className="h-4 w-4 text-primary" /><div><p className="text-sm font-semibold">Conecteaza-te rapid</p><p className="text-xs text-muted-foreground">Arata sau scaneaza codul de profil.</p></div></div>
        <button type="button" onClick={() => setShowCode(!showCode)} className="h-9 rounded-full border border-white/15 px-3 text-xs font-semibold">{showCode ? "Ascunde" : "Codul meu"}</button>
      </div>
      {showCode && <div className="mt-4 flex flex-col items-center gap-4 border-t border-white/10 pt-4 sm:flex-row sm:items-start"><div className="bg-white p-2"><TicketQrCode value={value} size={132} alt="Cod QR profil Pulse" /></div><QrCameraScanner onScan={(value) => void connect(value)} /></div>}
      {message && <p className="mt-3 text-xs text-primary">{message}</p>}
    </section>
  );
}
