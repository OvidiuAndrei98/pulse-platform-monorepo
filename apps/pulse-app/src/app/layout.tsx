import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/core/DataProviderContext";
import { BottomNav } from "@/components/BottomNav";
import { GlobalNotifications } from "@/components/GlobalNotifications";
import { I18nProvider } from "@/components/I18nProvider";
import { EventDetailsProvider } from "@/components/EventDetailsSheet";
import { OfflineScannerServiceWorker } from "@/components/OfflineScannerServiceWorker";
import { ToastProvider } from "@/components/ToastProvider";
import { NativeAppBridge } from "@/components/NativeAppBridge";

export const dynamic = "force-dynamic";

const inter = Inter({
  variable: "--font-inter-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Glow",
  description: "Glow Event Platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Glow",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // O face să se simtă ca o aplicație nativă, fără zoom accidental
};

export default function RootLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  modal?: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-screen overflow-x-hidden bg-[#0b0c0e] text-white">
        {/* Background global */}
        <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          {/* Blob 1 */}
          <div className="absolute -left-20 -top-16 h-[220px] w-[220px] rounded-full bg-emerald-500/15 blur-[40px] md:-left-28 md:-top-20 md:h-[380px] md:w-[380px] md:bg-emerald-500/20 md:blur-[130px]" />

          {/* Blob 2 */}
          <div className="absolute -right-16 top-[36%] h-[240px] w-[210px] rounded-full bg-green-500/10 blur-[44px] md:-right-24 md:top-[30%] md:h-[420px] md:w-[350px] md:bg-green-500/15 md:blur-[140px]" />

          {/* Blob 3 */}
          <div className="absolute -bottom-8 -left-8 h-[200px] w-[200px] rounded-full bg-emerald-400/15 blur-[36px] md:-bottom-10 md:-left-10 md:h-[320px] md:w-[320px] md:bg-emerald-400/20 md:blur-[120px]" />

          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0b0c0e]/40 to-[#0b0c0e]" />
        </div>

        {/* Conținut */}
        <div className="relative z-10">
          <I18nProvider>
            <DataProvider>
              <EventDetailsProvider>
                {children}
                {modal}
              </EventDetailsProvider>
              <GlobalNotifications />
              <ToastProvider />
              <BottomNav />
              <OfflineScannerServiceWorker />
              <NativeAppBridge />
            </DataProvider>
          </I18nProvider>
        </div>
      </body>
    </html>
  );
}
