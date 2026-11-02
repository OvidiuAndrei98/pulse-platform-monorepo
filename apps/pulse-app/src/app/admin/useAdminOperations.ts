"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createScopedActionGate } from '@packages/app-core/async/actionGate';

import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { type EventCancellationRequest, type OrganizerVerificationRequest, type PromotionInvoiceAttention, type RefundAttentionItem } from "@/core/DataProvider";
import { useDataProvider } from "@/core/DataProviderContext";

import { type AdminSection } from '@packages/app-core/admin/navigation';

import { StatusFilter, getStripeStatus, StripeStatus } from "./useAdminOperations.contracts";

export function useAdminOperations({ section }: { section: AdminSection }) {

  const { t, i18n } = useTranslation();
  const { user, logout } = useDataProvider();
  const actor = useRef(user), mounted = useRef(true);
  actor.current = user;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const retryGate = useRef(createScopedActionGate(()=>mounted.current&&actor.current?.properties.role==='admin'?actor.current:undefined));
  const [retryingCancellation,setRetryingCancellation] = useState<{actor:NonNullable<typeof user>;id:string}>();
  const retryingCancellationId=retryingCancellation?.actor===user?retryingCancellation?.id:undefined;
  const retryCancellation = async (id:string) => {
    if(!user || user.properties.role!=='admin')return;
    const lease=retryGate.current.acquire(user);
    if(!lease)return;
    setRetryingCancellation({actor:user,id});
    try {
      await user.retryEventCancellation(id);
      if(!lease.current())return;
      toast.success(t('adminCancellations.retryStarted'));
      const requests=await user.listEventCancellationRequests();
      if(lease.current())setCancellations(requests);
    } catch {
      if(lease.current())toast.error(t('adminCancellations.saveFailed'));
    } finally {
      if(lease.current())setRetryingCancellation(undefined);
      lease.release();
    }
  };
  const [requests, setRequests] = useState<OrganizerVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [reviewTarget, setReviewTarget] = useState<{
    request: OrganizerVerificationRequest;
    status: "approved" | "rejected";
  }>();
  const [reviewing, setReviewing] = useState(false);
  const [cancellations, setCancellations] = useState<EventCancellationRequest[]>([]);
  const [cancellationsLoading, setCancellationsLoading] = useState(true);
  const [cancellationTarget, setCancellationTarget] = useState<{ request: EventCancellationRequest; action: "retain" | "refund" | "reject" }>();
  const [adminNote, setAdminNote] = useState("");
  const [refunds, setRefunds] = useState<RefundAttentionItem[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(true);
  const [refundsError, setRefundsError] = useState("");
  const [reconcilingOrderId, setReconcilingOrderId] = useState<string>();
  const [promotionInvoiceAttention, setPromotionInvoiceAttention] = useState<PromotionInvoiceAttention[]>([]);
  const [promotionInvoiceAttentionLoading, setPromotionInvoiceAttentionLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    if (user?.properties.role!=='admin' || section !== 'verifications') return;
    setLoading(true);
    try {
      setRequests(await user.listOrganizerVerifications());
    } catch {
      toast.error(t("admin.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t, user, section]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const loadCancellations = useCallback(async () => {
    if (user?.properties.role!=='admin' || section !== 'cancellations') return;
    setCancellationsLoading(true);
    try {
      setCancellations(await user.listEventCancellationRequests());
    } catch {
      toast.error(t("adminCancellations.loadFailed"));
    } finally {
      setCancellationsLoading(false);
    }
  }, [t, user, section]);

  useEffect(() => {
    void loadCancellations();
  }, [loadCancellations]);

  const loadRefunds = useCallback(async () => {
    if (user?.properties.role!=='admin' || section !== 'refunds') return;
    setRefundsLoading(true);
    setRefundsError("");
    try {
      setRefunds(await user.listAdminRefundsRequiringAttention());
    } catch {
      setRefundsError(t("refundAttention.loadFailed"));
    } finally {
      setRefundsLoading(false);
    }
  }, [t, user, section]);

  useEffect(() => {
    void loadRefunds();
  }, [loadRefunds]);

  const loadPromotionInvoiceAttention = useCallback(async () => {
    if (user?.properties.role!=='admin' || section !== 'invoices') return;
    setPromotionInvoiceAttentionLoading(true);
    try {
      setPromotionInvoiceAttention(await user.listPromotionInvoicesRequiringAttention());
    } catch {
      toast.error(t("adminPromotionInvoices.loadFailed"));
    } finally {
      setPromotionInvoiceAttentionLoading(false);
    }
  }, [t, user, section]);

  useEffect(() => {
    void loadPromotionInvoiceAttention();
  }, [loadPromotionInvoiceAttention]);

  const reconcileRefund = async (orderId: string) => {
    if (!user || reconcilingOrderId) return;
    setReconcilingOrderId(orderId);
    try {
      const result = await user.reconcileAdminRefund(orderId);
      if (result.requiresAttention) {
        toast.info(t("refundAttention.stillPartial"));
      } else {
        toast.success(t("refundAttention.fullyRefunded"));
      }
      await Promise.all([loadRefunds(), loadCancellations()]);
    } catch {
      toast.error(t("refundAttention.checkFailed"));
    } finally {
      setReconcilingOrderId(undefined);
    }
  };

  const confirmCancellation = async () => {
    if (!user || !cancellationTarget) return;
    setReviewing(true);
    try {
      if (cancellationTarget.action === "reject") {
        await user.rejectEventCancellation(cancellationTarget.request.id, adminNote);
      } else {
        await user.approveEventCancellation(cancellationTarget.request.id, cancellationTarget.action, adminNote);
      }
      toast.success(t("adminCancellations.saved"));
      setCancellationTarget(undefined);
      setAdminNote("");
      await loadCancellations();
    } catch {
      toast.error(t("adminCancellations.saveFailed"));
    } finally {
      setReviewing(false);
    }
  };

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((request) => request.verificationStatus === "pending").length,
      approved: requests.filter((request) => request.verificationStatus === "approved").length,
      rejected: requests.filter((request) => request.verificationStatus === "rejected").length,
    }),
    [requests],
  );

  const visibleRequests = useMemo(
    () =>
      filter === "all"
        ? requests
        : requests.filter((request) => request.verificationStatus === filter),
    [filter, requests],
  );

  const stripeCounts = useMemo(
    () =>
      requests.reduce(
        (result, request) => {
          result[getStripeStatus(request)] += 1;
          return result;
        },
        { active: 0, onboarding: 0, attention: 0, notConnected: 0 } satisfies Record<StripeStatus, number>,
      ),
    [requests],
  );

  const confirmReview = async () => {
    if (!user || !reviewTarget) return;
    setReviewing(true);
    try {
      const profile = await user.reviewOrganizerVerification(
        reviewTarget.request.userId,
        reviewTarget.status,
      );
      setRequests((current) =>
        current.map((request) =>
          request.userId === reviewTarget.request.userId
            ? {
                ...request,
                verificationStatus: profile.verificationStatus,
                verifiedAt:
                  profile.verificationStatus === "approved"
                    ? new Date().toISOString()
                    : undefined,
                updatedAt: new Date().toISOString(),
              }
            : request,
        ),
      );
      toast.success(
        reviewTarget.status === "approved"
          ? t("admin.approvedSuccess")
          : t("admin.rejectedSuccess"),
      );
      setReviewTarget(undefined);
    } catch {
      toast.error(t("admin.reviewFailed"));
    } finally {
      setReviewing(false);
    }
  };

  const locale = i18n.language === "ro" ? "ro-RO" : "en-GB";
  return {
    retryCancellation,
    retryingCancellationId,
    adminNote,
    cancellationTarget,
    cancellations,
    cancellationsLoading,
    confirmCancellation,
    confirmReview,
    counts,
    filter,
    i18n,
    loadCancellations,
    loadPromotionInvoiceAttention,
    loadRefunds,
    loadRequests,
    loading,
    locale,
    logout,
    promotionInvoiceAttention,
    promotionInvoiceAttentionLoading,
    reconcileRefund,
    reconcilingOrderId,
    refunds,
    refundsError,
    refundsLoading,
    reviewTarget,
    reviewing,
    section,
    setAdminNote,
    setCancellationTarget,
    setFilter,
    setReviewTarget,
    stripeCounts,
    t,
    user,
    visibleRequests,
  };
}
export type AdminOperationsPageModel = ReturnType<typeof useAdminOperations>;
