import DashboardEventPageClient from "./DashboardEventPageClient";

export function generateStaticParams() {
  return [{ eventId: "mobile" }];
}

export default function DashboardEventPage() {
  return <DashboardEventPageClient />;
}
