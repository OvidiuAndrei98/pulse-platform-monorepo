import { Metadata } from "next";
import { OrganizerSidebar } from "./components/DashboardSidebar";
import { OrganizerHeader } from "./components/DashboardSliderMenu";
import { DashboardAccessGuard } from "./components/DashboardAccessGuard";
import { resources } from "@/i18n/resources";

export const metadata: Metadata = {
  title: resources.en.translation.metadata.organizerTitle,
  description: resources.en.translation.metadata.organizerDescription,
};

export default function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardAccessGuard>
      <div className="min-h-screen ">
        <OrganizerSidebar />
        <div className="md:pb-0 md:pl-60">
          <OrganizerHeader />
          {children}
        </div>
      </div>
    </DashboardAccessGuard>
  );
}
