import EventSafetyGroupPageClient from "./EventSafetyGroupPageClient";
import { Suspense } from "react";

export function generateStaticParams() {
  return [{ id: "mobile" }];
}

export default function EventSafetyGroupPage() {
  return <Suspense><EventSafetyGroupPageClient /></Suspense>;
}
