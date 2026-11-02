"use client";

import { Loader2, MailPlus, Trash2, UserRoundCheck, UsersRound } from "lucide-react";

import { Input as UIInput } from '@/components/ui/Field';

import type { TicketValidationWorkspaceModel } from "../useTicketValidation";

export function ValidationStaffPanel({model}: {model: Pick<TicketValidationWorkspaceModel, "addStaff" | "removeStaff" | "savingStaff" | "selectedEvent" | "setStaffEmail" | "staff" | "staffEmail" | "staffLoading" | "t">}) {
 const { addStaff, removeStaff, savingStaff, selectedEvent, setStaffEmail, staff, staffEmail, staffLoading, t }=model;
 if(!selectedEvent)return null;
 return (<section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <UsersRound className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">
                  {t("validation.validationTeam")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("validation.staffHint", { event: selectedEvent.title })}
                </p>
              </div>
            </div>

            <form
              onSubmit={addStaff}
              className="mt-5 flex flex-col gap-2 sm:flex-row"
            >
              <UIInput
                type="email"
                value={staffEmail}
                onChange={(event) => setStaffEmail(event.target.value)}
                placeholder={t("validation.staffEmailPlaceholder")}
                required
                className="h-11 min-w-0 flex-1"
              />
              <button
                type="submit"
                disabled={!staffEmail.trim() || savingStaff}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20 disabled:opacity-50"
              >
                {savingStaff ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MailPlus className="h-4 w-4" />
                )}
                {t("validation.addAccess")}
              </button>
            </form>

            <div className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10">
              {staffLoading ? (
                <div className="flex h-16 items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : staff.length ? (
                staff.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-3 py-3"
                  >
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <UserRoundCheck className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {member.username}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeStaff(member)}
                      aria-label={t("validation.removeAccess", {
                        name: member.username,
                      })}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 text-muted-foreground transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {t("validation.onlyYou")}
                </p>
              )}
            </div>
          </section>);
}
