import { useIsFocused } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { components } from '@packages/api-client/src/schema';
import { accountApi, useAuth } from '../auth/AuthProvider';
import { ApiError } from './http';
import { observeOperation } from '../diagnostics/handled';
import { isVisibleTransaction } from '../../../pulse-app/src/features/checkout/orderHistory';

export function useOrders() {
  const { user } = useAuth(), focused = useIsFocused();
  return useQuery<components['schemas']['UserOrderResponse'][]>({
    queryKey: ['orders', user?.id],
    enabled: !!user && focused,
    staleTime: 0,
    refetchInterval: focused ? 10000 : false,
    select: (orders) => orders.filter(isVisibleTransaction),
    queryFn: ({ signal }) => observeOperation('orders_load', async () => {
      const value = await accountApi<components['schemas']['UserOrderResponse'][] | null>('/users/me/orders', { signal });
      if (value === null) return [];
      if (!Array.isArray(value) || value.some(row => !row || typeof row.id !== 'string' || typeof row.eventTitle !== 'string'
        || !Number.isFinite(row.paidTotalBani) || (row.orderTotalBani !== undefined && !Number.isFinite(row.orderTotalBani))
        || !Number.isFinite(Date.parse(row.createdAt)))) throw new ApiError(0, 'INVALID_RESPONSE');
      return value;
    }),
  });
}
