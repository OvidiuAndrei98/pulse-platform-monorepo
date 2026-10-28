import type { ErrorEntry, ErrorReport, HandledFailure } from './report';

const operationLabels: Record<HandledFailure['operation'], [string, string]> = {
  api_request: ['Cerere către server', 'Server request'],
  tickets_load: ['Încărcarea biletelor', 'Loading tickets'],
  tickets_storage: ['Salvarea locală a biletelor', 'Local ticket storage'],
  orders_load: ['Încărcarea comenzilor', 'Loading orders'],
  payment_prepare: ['Pregătirea plății', 'Preparing payment'],
  payment_confirm: ['Verificarea plății', 'Verifying payment'],
  payment_present: ['Formularul Stripe', 'Stripe payment form'],
  payment_storage: ['Salvarea recuperării plății', 'Payment recovery storage'],
  payment_ticket_delivery: ['Biletul după plata confirmată', 'Ticket after confirmed payment'],
  scanner_events: ['Evenimentele scannerului', 'Scanner events'],
  scanner_prepare: ['Pregătirea scannerului', 'Preparing scanner'],
  scanner_validate: ['Validarea biletului', 'Validating ticket'],
  scanner_sync: ['Sincronizarea scanărilor', 'Synchronizing scans'],
  scanner_storage: ['Salvarea locală a scanărilor', 'Local scan storage'],
};
const failureLabels: Record<HandledFailure['failure'], [string, string]> = {
  server_error: ['Eroare internă a serverului', 'Internal server error'],
  invalid_response: ['Răspuns invalid de la server', 'Invalid server response'],
  storage_error: ['Datele locale nu pot fi citite sau salvate', 'Local data could not be read or saved'],
  sdk_error: ['Eroare tehnică Stripe', 'Stripe technical error'],
  configuration: ['Configurare Stripe invalidă', 'Invalid Stripe configuration'],
  fulfillment_missing: ['Plată confirmată, biletul nu apare în răspunsul actualizat', 'Payment confirmed, ticket missing from refreshed response'],
};
export function diagnosticTitle(report: ErrorReport, ro: boolean) {
  return report.operation ? operationLabels[report.operation][ro ? 0 : 1] : `${report.errorType} · ${report.category}`;
}
export function diagnosticFailure(report: ErrorReport, ro: boolean) {
  return report.failure ? failureLabels[report.failure][ro ? 0 : 1] + (report.httpStatus ? ` · HTTP ${report.httpStatus}` : '') : '';
}

/** Counts cover the loaded pages only; exports keep every original report. */
export function groupDiagnosticReports(rows: ErrorEntry[]) {
  const groups = new Map<string, { report: ErrorEntry; count: number }>();
  const seen = new Set<string>();
  for (const report of rows) {
    if (seen.has(report.id)) continue;
    seen.add(report.id);
    const group = groups.get(report.fingerprint);
    if (!group) groups.set(report.fingerprint, { report, count: 1 });
    else {
      group.count++;
      if (Date.parse(report.receivedAt) > Date.parse(group.report.receivedAt)) group.report = report;
    }
  }
  return [...groups.values()].sort((a, b) => Date.parse(b.report.receivedAt) - Date.parse(a.report.receivedAt));
}
