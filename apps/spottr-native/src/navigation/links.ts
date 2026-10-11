import { parseOrganizerReturn } from '../../../pulse-app/src/features/checkout/organizerReturn';
/** Normalize original web routes into the native route graph, preserving only typed destinations. */
export function nativePath(path: string) {
  const value = new URL(path.replace(/^\/+/, ''), 'https://native.invalid/'), params = value.searchParams;
  let name = value.pathname;
  if (name === '/organizer/return') {
    const result = parseOrganizerReturn(params);
    if (!result) return 'dashboard';
    const destination = new URLSearchParams({ organizerReturn: result.flow, returnStatus: result.status });
    if (result.flow === 'promotion') destination.set('campaignId', result.campaignId);
    return 'dashboard/' + (result.flow === 'promotion' ? 'promotions' : 'overview') + '?' + destination;
  }
  if (['/register', '/forgot-password', '/reset-password'].includes(name)) {
    params.set('mode', name === '/register' ? 'register' : name === '/forgot-password' ? 'forgot' : 'reset'); name = '/login';
  }
  if (name === '/events/mobile' && params.get('eventId')) name = '/events/' + encodeURIComponent(params.get('eventId')!);
  if (name === '/events/mobile/group' && params.get('groupEventId')) name = '/events/' + encodeURIComponent(params.get('groupEventId')!) + '/group';
  if (name === '/users/mobile' && params.get('profileId')) name = '/users/' + encodeURIComponent(params.get('profileId')!);
  if (name === '/dashboard/ticket-validation') name = '/ticket-validation';
  if (name === '/dashboard/events/new') name = '/dashboard/new';
  else if (name === '/dashboard/events/mobile') { const id = params.get('dashboardEventId'); if (id) params.set('eventId', id); name = '/dashboard/edit'; }
  else if (name === '/dashboard/events/edit') name = '/dashboard/edit';
  else if (/^\/dashboard\/events\/[^/]+$/.test(name)) { params.set('eventId', name.split('/')[3]!); name = '/dashboard/edit'; }
  if (name === '/dashboard/events') name = '/dashboard/events';
  if (name === '/organizers/stripe-connect') name = '/dashboard/stripe-info';
  if (name === '/organizers/agreement') name = '/dashboard/agreement';
  if (name === '/legal/privacy' || name === '/legal/terms') params.delete('document');
  return name.slice(1) + (params.size ? '?' + params.toString() : '');
}
