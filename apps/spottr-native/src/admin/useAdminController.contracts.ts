

import { type Cancellation, type CancellationAction, type OrganizerReview } from './data';

export type Confirmation = { kind: 'organizer'; request: OrganizerReview; status: 'approved' | 'rejected' } | { kind: 'cancellation'; request: Cancellation; action: CancellationAction };
