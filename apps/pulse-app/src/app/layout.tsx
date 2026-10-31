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
import { resources } from "@/i18n/resources";
import { ClientNavigation } from "@/components/ClientNavigation";
import { TabPageTransition } from "@/components/TabPageTransition";
import { InterfaceProvider } from '@/components/ui/InterfaceProvider';

const inter = Inter({
  variable: "--font-inter-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: resources.en.translation.metadata.appTitle,
  description: resources.en.translation.metadata.appDescription,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    // Home Screen web apps should reserve space for the iOS status bar.
    statusBarStyle: "black",
    title: resources.en.translation.metadata.appTitle,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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

        <div className="relative z-10">
          <InterfaceProvider><I18nProvider>
            <DataProvider>
              <ClientNavigation />
              <EventDetailsProvider><TabPageTransition>{children}</TabPageTransition></EventDetailsProvider>
              <BottomNavGate />
              <OfflineScannerServiceWorker />
              <NativeAppBridge />
              <NativeNavigationGestures />
            </DataProvider>
          </I18nProvider></InterfaceProvider>
        </div>
        <ToastProvider />
      </body>
    </html>
  );
}
