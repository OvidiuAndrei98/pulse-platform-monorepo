import TicketValidationPage from "@/app/dashboard/ticket-validation/page";
import { DashboardAccessGuard } from "@/app/dashboard/components/DashboardAccessGuard";

export default function LegacyTicketValidationPage() {
  return <DashboardAccessGuard><TicketValidationPage /></DashboardAccessGuard>;
}
