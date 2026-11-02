export const SERVICE_FEE_PERCENT = 5;
export const SERVICE_FEE_PER_TICKET_RON = 1.5;

export type EventCommission = { commissionRateBps?: number; commissionPerTicketBani?: number };
export function calculateServiceFeeRon(
  ticketSubtotalRon: number,
  ticketCount: number,
  commission: EventCommission = {},
) {
  if (ticketSubtotalRon <= 0 || ticketCount <= 0) return 0;

  const rateBps = commission.commissionRateBps ?? SERVICE_FEE_PERCENT * 100;
  const perTicketBani = commission.commissionPerTicketBani ?? SERVICE_FEE_PER_TICKET_RON * 100;
  const subtotalBani = Math.round(ticketSubtotalRon * 100);
  return (Math.ceil(subtotalBani * rateBps / 10000) + ticketCount * perTicketBani) / 100;
}

export function formatRon(value: number) {
  return `${value.toLocaleString("ro-RO", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} RON`;
}
