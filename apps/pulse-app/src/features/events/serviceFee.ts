export const SERVICE_FEE_PERCENT = 4;
export const SERVICE_FEE_PER_TICKET_RON = 2.5;

export function calculateServiceFeeRon(
  ticketSubtotalRon: number,
  ticketCount: number,
) {
  if (ticketSubtotalRon <= 0 || ticketCount <= 0) return 0;

  return Number(
    (ticketSubtotalRon * (SERVICE_FEE_PERCENT / 100) +
      ticketCount * SERVICE_FEE_PER_TICKET_RON).toFixed(2),
  );
}

export function formatRon(value: number) {
  return `${value.toLocaleString("ro-RO", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} RON`;
}
