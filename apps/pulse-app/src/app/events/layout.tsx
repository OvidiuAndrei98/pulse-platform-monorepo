import { EventDetailsProvider } from "@/components/EventDetailsSheet";

export default function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <EventDetailsProvider>{children}</EventDetailsProvider>
    </>
  );
}
