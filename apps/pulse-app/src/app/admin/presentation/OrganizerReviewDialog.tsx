"use client";

import { ModalFrame } from "@/components/ui/ModalFrame";

import { CircleCheck, CircleX, Loader2 } from "lucide-react";

import type { AdminOperationsPageModel } from "../useAdminOperations";

export function OrganizerReviewDialog({model}: {model: Pick<AdminOperationsPageModel, "confirmReview" | "reviewTarget" | "reviewing" | "setReviewTarget" | "t">}) {
 const { confirmReview, reviewTarget, reviewing, setReviewTarget, t }=model;
 if(!reviewTarget)return null;
 return (<ModalFrame open onClose={()=>setReviewTarget(undefined)} dismissible={!reviewing} label={reviewTarget.status==='approved'?t('admin.approveTitle'):t('admin.rejectTitle')}>
          <div className="p-5">
            <div className={`grid h-11 w-11 place-items-center rounded-full ${reviewTarget.status === "approved" ? "bg-primary/15 text-primary" : "bg-red-500/10 text-red-300"}`}>
              {reviewTarget.status === "approved" ? <CircleCheck className="h-5 w-5" /> : <CircleX className="h-5 w-5" />}
            </div>
            <h2 className="mt-4 text-lg font-semibold">
              {reviewTarget.status === "approved" ? t("admin.approveTitle") : t("admin.rejectTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("admin.reviewHint", { company: reviewTarget.request.companyName })}
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                data-dialog-initial-focus
                onClick={() => setReviewTarget(undefined)}
                disabled={reviewing}
                className="h-10 flex-1 rounded-lg border border-white/15 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void confirmReview()}
                disabled={reviewing}
                className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50 ${reviewTarget.status === "approved" ? "bg-[var(--ui-action)]" : "bg-red-600 hover:bg-red-500"}`}
              >
                {reviewing && <Loader2 className="h-4 w-4 animate-spin" />}
                {reviewTarget.status === "approved" ? t("admin.approve") : t("admin.reject")}
              </button>
            </div>
          </div>
        </ModalFrame>);
}
