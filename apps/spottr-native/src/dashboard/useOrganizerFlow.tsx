import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { accountApi, useAuth } from "../auth/AuthProvider";
import { usePreferences } from "../PreferencesProvider";
import { Text } from "../ui/Text";
import { colors } from "../ui/theme";
import { Action, s } from "./common";
import {
  createOrganizerFlow,
  parseConnectStatus,
  parsePromotionReconciliation,
  type OrganizerExpectation,
  type OrganizerFlowState,
} from "./organizerFlow";
import { organizerClient, prepareOrganizerBrowser } from "./organizerBrowser";

export function useOrganizerFlow() {
  const { controller, user } = useAuth(),
    { copy } = usePreferences(),
    cache = useQueryClient();
  const [state, setState] = useState<OrganizerFlowState>({
    busy: false,
    error: false,
  });
  const mounted = useRef(true);
  const flow = useRef<ReturnType<typeof createOrganizerFlow> | null>(null);
  if (!flow.current)
    flow.current = createOrganizerFlow({
      session: () => controller.getToken(),
      prepare: prepareOrganizerBrowser,
      publish: (value) => {
        if (mounted.current) setState(value);
      },
    });
  useEffect(() => {
    mounted.current = true;
    flow.current!.cancel();
    return () => {
      mounted.current = false;
      flow.current!.cancel();
    };
  }, [user?.id]);
  async function reconcile(expected: OrganizerExpectation) {
    const token = controller.getToken();
    const result =
      expected.flow === "connect"
        ? parseConnectStatus(await accountApi("/dashboard/stripe/status"))
        : parsePromotionReconciliation(
            await accountApi(
              `/dashboard/promotions/${encodeURIComponent(expected.campaignId)}/reconcile`,
              { method: "POST" },
            ),
            expected.campaignId,
          );
    if (token !== controller.getToken()) throw new Error("SESSION_CHANGED");
    await cache.invalidateQueries({ queryKey: ["dashboard", user?.id] });
    return result;
  }
  const refresh = (expected: OrganizerExpectation) =>
    flow.current!.refresh(expected, reconcile);
  let message = "";
  if (state.error) message = copy("feedback.loadFailed");
  else if (state.status)
    message = copy(
      state.status === "connected"
        ? "dashboard.paymentsActive"
        : state.status === "incomplete"
          ? "dashboard.connectStripeToSell"
          : `promotions.status.${state.status}`,
    );
  return {
    ...state,
    client: organizerClient,
    start: (
      create: () => Promise<{ url: string; expected: OrganizerExpectation }>,
    ) => flow.current!.start(create, reconcile),
    refresh,
    feedback: (
      <>
        {message ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              s.muted,
              { color: state.error ? colors.danger : colors.muted },
            ]}
          >
            {message}
          </Text>
        ) : null}
        {state.expected &&
          (state.error || state.status === "pending_payment") && (
            <Action
              title={copy("feedback.retry")}
              secondary
              disabled={state.busy}
              onPress={() => void refresh(state.expected!)}
            />
          )}
        {state.expected && state.checkoutUrl && (
          <Action
            title={copy("promotions.payAndPromote")}
            disabled={state.busy}
            onPress={() =>
              void flow.current!.start(
                async () => ({
                  url: state.checkoutUrl!,
                  expected: state.expected!,
                }),
                reconcile,
              )
            }
          />
        )}
      </>
    ),
  };
}
