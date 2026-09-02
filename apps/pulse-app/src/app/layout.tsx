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
    statusBarStyle: "black-translucent",
    title: resources.en.translation.metadata.appTitle,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  userScalable: false,
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
