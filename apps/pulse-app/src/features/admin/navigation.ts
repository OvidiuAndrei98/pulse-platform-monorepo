export const adminSections = ['overview', 'organizers', 'verifications', 'cancellations', 'refunds', 'invoices', 'commissions', 'errors'] as const;
export type AdminSection = typeof adminSections[number];
const labels: Record<AdminSection, [string, string]> = {
  overview: ['Prezentare generală', 'Overview'], organizers: ['Organizatori', 'Organizers'],
  verifications: ['Verificări', 'Verifications'], cancellations: ['Anulări evenimente', 'Event cancellations'],
  refunds: ['Restituiri', 'Refunds'], invoices: ['Facturi promovare', 'Promotion invoices'],
  commissions: ['Comisioane', 'Commissions'], errors: ['Erori aplicație', 'Application errors'],
};
export const adminLabel = (section: AdminSection, ro: boolean) => labels[section][ro ? 0 : 1];
export const adminHref = (section: AdminSection) => section === 'overview' ? '/admin' : '/admin/' + section;
export const adminSection = (value: unknown): AdminSection => adminSections.includes(value as never) ? value as AdminSection : 'overview';
