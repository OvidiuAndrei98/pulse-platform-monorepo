import { Metadata } from "next";
import { OrganizerSidebar } from "./components/DashboardSidebar";
import { OrganizerHeader } from "./components/DashboardSliderMenu";

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
    <div className="min-h-screen ">
      <OrganizerSidebar />
      <div className="md:pl-60">
        <OrganizerHeader />
        {children}
      </div>
    </div>
  );
}
