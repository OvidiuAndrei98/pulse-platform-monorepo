"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth, accountApi } from '../auth/AuthProvider';
import { usePreferences } from '../usePreferences';
import { useOpenLink } from '../ui/common';

import { createAdminApi, organizerCounts, type ReviewStatus } from './data';

import { type AdminSection } from '@packages/app-core/admin/navigation';

import { Confirmation } from "./useAdminController.contracts";

export function useAdminController({ section }: { section: AdminSection }) {

  const { user, controller } = useAuth('account'), { copy, language } = usePreferences(), navigation = useNavigation<any>(), insets = useSafeAreaInsets(), viewport = useWindowDimensions(), link = useOpenLink();
  const allowed = user?.role === 'admin' && !!controller.getToken(), [filter, setFilter] = useState<'all' | ReviewStatus>('pending'), [target, setTarget] = useState<Confirmation>(), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [reconciling, setReconciling] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const locked = useRef(false), epoch = useRef(0), identity = controller.getToken();
  useEffect(() => { epoch.current++; setTarget(undefined); setError(''); setNotice(''); setBusy(false); locked.current = false; return () => { epoch.current++; }; }, [user?.id, identity]);
  const api = useMemo(() => createAdminApi(accountApi, () => ({ token: controller.getToken(), role: controller.getSnapshot().user?.role })), [controller]);
  const organizers = useQuery({ queryKey: ['admin-organizers', user?.id], enabled: allowed && section === 'verifications', retry: false, queryFn: ({ signal }) => api.organizers(signal) });
  const cancellations = useQuery({ queryKey: ['admin-cancellations', user?.id], enabled: allowed && section === 'cancellations', retry: false, queryFn: ({ signal }) => api.cancellations(signal) });
  const refunds = useQuery({ queryKey: ['admin-refunds', user?.id], enabled: allowed && section === 'refunds', retry: false, queryFn: ({ signal }) => api.refunds(signal) });
  const promotions = useQuery({ queryKey: ['admin-promotion-invoices', user?.id], enabled: allowed && section === 'invoices', retry: false, queryFn: ({ signal }) => api.promotionInvoices(signal) });
  const loading = organizers.isFetching || cancellations.isFetching || refunds.isFetching || promotions.isFetching;
  const refresh = async () => { if(section==='verifications') await organizers.refetch(); if(section==='cancellations') await cancellations.refetch(); if(section==='refunds') await refunds.refetch(); if(section==='invoices') await promotions.refetch(); };
  const { counts, stripe } = organizerCounts(organizers.data ?? []), visible = (organizers.data ?? []).filter(row => filter === 'all' || row.verificationStatus === filter);
  const locale = language === 'ro' ? 'ro-RO' : 'en-GB';
  const money = (value = 0) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'RON', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const action = async (work: (current: () => boolean) => Promise<void>, failure: string) => {
    if (locked.current || !allowed) return;
    locked.current = true; setBusy(true); setError(''); setNotice(''); const version = epoch.current;
    const current = () => version === epoch.current && identity === controller.getToken() && controller.getSnapshot().user?.role === 'admin';
    try { await work(current); } catch { if (current()) setError(copy(failure)); }
    finally { if (current()) { locked.current = false; setBusy(false); setReconciling(''); } }
  };
  const confirm = () => {
    if (!target) return;
    void action(async current => {
      if (target.kind === 'organizer') { await api.review(target.request.userId, target.status); if (!current()) return; setNotice(copy(target.status === 'approved' ? 'admin.approvedSuccess' : 'admin.rejectedSuccess')); setTarget(undefined); await organizers.refetch(); }
      else { await api.cancellation(target.request, target.action, note); if (!current()) return; setNotice(copy(target.action === 'retry' ? 'adminCancellations.retryStarted' : 'adminCancellations.saved')); setTarget(undefined); setNote(''); await Promise.all([cancellations.refetch(), refunds.refetch()]); }
    }, target.kind === 'organizer' ? 'admin.reviewFailed' : 'adminCancellations.saveFailed');
  };
  const choose = (value: Confirmation) => { if (busy) return; setNote(''); setError(''); setTarget(value); };
  const back = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Tabs', { screen: 'Profile' });
const logout = () => { void controller.logout().then(() => navigation.reset({ index:0,routes:[{name:"Tabs"}] })); };
const reconcileRefund = (orderId:string) => { void action(async current => {setReconciling(orderId);const result=await api.reconcile(orderId);if(!current())return;setNotice(copy(result.requiresAttention?"refundAttention.stillPartial":"refundAttention.fullyRefunded"));await Promise.all([refunds.refetch(),cancellations.refetch()]);},"refundAttention.checkFailed"); };
  return {
    logout,
    reconcileRefund,
    allowed,
    back,
    busy,
    cancellations,
    choose,
    confirm,
    copy,
    counts,
    date,
    error,
    filter,
    insets,
    language,
    link,
    loading,
    money,
    navigation,
    note,
    notice,
    organizers,
    promotions,
    reconciling,
    refresh,
    refunds,
    section,
    setFilter,
    setNote,
    setNotice,
    setReconciling,
    setTarget,
    stripe,
    target,
    viewport,
    visible,
  };
}
export type AdminOperationsScreenModel = ReturnType<typeof useAdminController>;
