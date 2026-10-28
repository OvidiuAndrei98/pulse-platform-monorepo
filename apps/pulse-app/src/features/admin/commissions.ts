import type { components } from '@packages/api-client/src/schema';
export type CommissionTerms = components['schemas']['CommissionTerms'];
export type CommissionSettings = components['schemas']['CommissionSettings'];
export type OrganizerCommission = components['schemas']['OrganizerCommission'];

// Decimal inputs stay strings until validated; empty, exponent and negative values
// must never accidentally become a zero-fee contract.
function hundredths(input: string, max: number): number | null {
  const text = input.trim().replace(',', '.');
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return value <= max ? value : null;
}
export function parseCommissionInputs(percent: string, fixedRon: string): CommissionTerms | null {
  const rateBps = hundredths(percent, 10000), perTicketBani = hundredths(fixedRon, 100000);
  return rateBps === null || perTicketBani === null ? null : { rateBps, perTicketBani };
}
export function commissionFormula(terms: CommissionTerms, ro: boolean) {
  const format = (value: number) => (value / 100).toLocaleString(ro ? 'ro-RO' : 'en-GB', { maximumFractionDigits: 2 });
  return `${format(terms.rateBps)}% + ${format(terms.perTicketBani)} RON / ${ro ? 'bilet' : 'ticket'}`;
}
export function parseCommissionSettings(value: unknown): CommissionSettings {
  const row = value as CommissionSettings | null;
  const valid = (terms: CommissionTerms) => terms && Number.isInteger(terms.rateBps) && terms.rateBps >= 0 && terms.rateBps <= 10000 && Number.isInteger(terms.perTicketBani) && terms.perTicketBani >= 0 && terms.perTicketBani <= 100000;
  if (!row || !valid(row.standard) || !Number.isSafeInteger(row.standard.revision) || row.standard.revision < 1 || !Array.isArray(row.organizers) || row.organizers.some(o => !o || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(o.organizerId) || typeof o.companyName !== 'string' || typeof o.email !== 'string' || !Number.isSafeInteger(o.revision) || o.revision < 0 || (o.override !== null && !valid(o.override)))) throw new Error('INVALID_COMMISSION_RESPONSE');
  return row;
}
export const commissionText = (ro: boolean) => ro ? {
  title: 'Comisioane organizatori', standard: 'Comision standard', negotiated: 'Negociat', inherited: 'Standard',
  hint: 'Organizatorii pe Standard preiau automat modificările standardului. Comisioanele negociate rămân fixe până le modifici.',
  future: 'Se aplică doar comenzilor noi. Plățile deja începute și comenzile anterioare își păstrează comisionul.',
  search: 'Caută firma sau emailul', percent: 'Procent (%)', fixed: 'Sumă fixă / bilet (RON)', edit: 'Modifică', save: 'Salvează comisionul', cancel: 'Renunță',
  reset: 'Folosește standardul', custom: 'Comision negociat', empty: 'Niciun organizator găsit.', loading: 'Se încarcă...', retry: 'Încearcă din nou',
  invalid: 'Introdu un procent între 0 și 100 și o sumă între 0 și 1.000 RON, cu cel mult două zecimale.',
  failed: 'Comisionul nu a putut fi salvat. Dacă a fost modificat între timp, reîncarcă datele și încearcă din nou.', loadFailed: 'Comisioanele nu au putut fi încărcate.', saved: 'Comision salvat.',
} : {
  title: 'Organizer commissions', standard: 'Standard commission', negotiated: 'Negotiated', inherited: 'Standard',
  hint: 'Organizers on Standard automatically inherit changes to the standard. Negotiated commissions stay fixed until you edit them.',
  future: 'Applies to new orders only. Payments already started and previous orders keep their commission.',
  search: 'Search company or email', percent: 'Percentage (%)', fixed: 'Fixed amount / ticket (RON)', edit: 'Edit', save: 'Save commission', cancel: 'Cancel',
  reset: 'Use standard', custom: 'Negotiated commission', empty: 'No organizers found.', loading: 'Loading...', retry: 'Try again',
  invalid: 'Enter a percentage from 0 to 100 and an amount from 0 to 1,000 RON, with up to two decimal places.',
  failed: 'The commission could not be saved. If it changed in the meantime, reload the data and try again.', loadFailed: 'Commissions could not be loaded.', saved: 'Commission saved.',
};
