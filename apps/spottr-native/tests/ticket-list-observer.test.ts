import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { selectTicketList, type TicketData } from '../src/data/ticketQuery';

test('wallet UI ignores persistence/fetch metadata but immediately observes admission changes', () => {
  const client = new QueryClient(), key = ['tickets', 'account-a'];
  const snapshot = { accountId: 'account-a', savedAt: 1, source: 'server', storageError: false,
    tickets: [{ id: 'ticket-a', isValidated: false }] } as TicketData;
  client.setQueryData(key, snapshot);
  const observer = new QueryObserver(client, { queryKey: key, enabled: false, select: selectTicketList });
  let renders = 0;
  const stop = observer.subscribe(() => renders++);
  const tracked = observer.trackResult(observer.getCurrentResult());
  void tracked.data; void tracked.error; void tracked.isPending; void tracked.isError;
  client.setQueryData(key, { ...snapshot, savedAt: 2, storageError: true });
  assert.equal(renders, 0, 'writing the same admissions to secure storage does not rebuild Profile');
  client.setQueryData(key, { ...snapshot, savedAt: 3, tickets: [{ ...snapshot.tickets[0], isValidated: true }] });
  assert.equal(renders, 1); assert.equal(observer.getCurrentResult().data?.[0]?.isValidated, true);
  // A newly signed-in account has its own observer and cannot see account A.
  observer.setOptions({ queryKey: ['tickets', 'account-b'], enabled: false, select: selectTicketList });
  assert.equal(observer.getCurrentResult().data, undefined);
  stop(); observer.destroy(); client.clear();
});
