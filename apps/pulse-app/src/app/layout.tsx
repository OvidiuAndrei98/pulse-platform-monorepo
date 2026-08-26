import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/core/DataProviderContext";
import { BottomNavGate } from "@/components/BottomNav";
import { I18nProvider } from "@/components/I18nProvider";
import { EventDetailsProvider } from "@/components/EventDetailsSheet";
import { OfflineScannerServiceWorker } from "@/components/OfflineScannerServiceWorker";
import { ToastProvider } from "@/components/ToastProvider";
import { NativeAppBridge } from "@/components/NativeAppBridge";
import { NativeNavigationGestures } from "@/components/NativeNavigationGestures";

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
  viewportFit: "cover",
  userScalable: false, // O face să se simtă ca o aplicație nativă, fără zoom accidental
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-screen overflow-x-hidden bg-[#000000] text-white">
        {/* Background global */}

        {/* Conținut */}
        <div className="relative z-10">
          <I18nProvider>
            <DataProvider>
              <EventDetailsProvider>{children}</EventDetailsProvider>
              <ToastProvider />
              <BottomNavGate />
              <OfflineScannerServiceWorker />
              <NativeAppBridge />
              <NativeNavigationGestures />
            </DataProvider>
          </I18nProvider>
        </div>
      </body>
    </html>
  );
}
