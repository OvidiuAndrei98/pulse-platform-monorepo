import EventDetailsPageClient from "./EventDetailsPageClient";

export function generateStaticParams() {
  return [{ id: "mobile" }];
}

export default function EventDetailsPage() {
  return <EventDetailsPageClient />;
}
