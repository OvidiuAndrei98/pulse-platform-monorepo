"use client";

import { BottomNav } from "@/components/BottomNav";
import { EventDetailsProvider } from "@/components/EventDetailsSheet";
import { GlobalNotifications } from "@/components/GlobalNotifications";
import { I18nProvider } from "@/components/I18nProvider";
import { NativeAppBridge } from "@/components/NativeAppBridge";
import { OfflineScannerServiceWorker } from "@/components/OfflineScannerServiceWorker";
import { ToastProvider } from "@/components/ToastProvider";
import { DataProvider } from "@/core/DataProviderContext";

export function MobileAppProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <DataProvider>
        <EventDetailsProvider>{children}</EventDetailsProvider>
        <GlobalNotifications />
        <ToastProvider />
        <BottomNav />
        <OfflineScannerServiceWorker />
        <NativeAppBridge />
      </DataProvider>
    </I18nProvider>
  );
}
