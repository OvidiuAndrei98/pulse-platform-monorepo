import { Metadata } from "next";
import { OrganizerSidebar } from "./components/DashboardSidebar";
import { OrganizerHeader } from "./components/DashboardSliderMenu";
import { DashboardAccessGuard } from "./components/DashboardAccessGuard";

export const metadata: Metadata = {
  title: "Organizer — Eventify",
  description: "Manage your events, tickets and organizer profile.",
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
        <div className="pb-[calc(var(--native-safe-bottom)+7.5rem)] md:pb-0 md:pl-60">
          <OrganizerHeader />
          {children}
        </div>
      </div>
    </DashboardAccessGuard>
  );
}
