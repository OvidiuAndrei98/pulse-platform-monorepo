"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function TicketQrCode({ value, size = 220, alt = "Cod QR bilet" }: { value: string; size?: number; alt?: string }) {
  const [imageUrl, setImageUrl] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    }).then((url) => {
      if (active) setImageUrl(url);
    }).catch(() => {
      if (active) setImageUrl("");
    });
    return () => {
      active = false;
    };
  }, [size, value]);

  if (!imageUrl) return <div className="animate-pulse bg-black/10" style={{ width: size, height: size }} />;

  return <img src={imageUrl} width={size} height={size} alt={alt} className="block" />;
}
