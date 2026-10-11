import {
  NATIVE_ORGANIZER_RETURN,
  parseOrganizerReturn,
} from "../../../pulse-app/src/features/checkout/organizerReturn";
export type OrganizerExpectation =
  { flow: "connect" } | { flow: "promotion"; campaignId: string };
export type OrganizerPaymentStatus =
  | "connected"
  | "incomplete"
  | "pending_payment"
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled";
export type OrganizerReconciliation =
  | OrganizerPaymentStatus
  | { status: OrganizerPaymentStatus; checkoutUrl?: string };
export type OrganizerFlowState = {
  busy: boolean;
  error: boolean;
  expected?: OrganizerExpectation;
  status?: OrganizerPaymentStatus;
  checkoutUrl?: string;
};
export type OrganizerBrowser = {
  open(url: string, expected: OrganizerExpectation): Promise<void>;
  dispose(): void;
};

export function validateOrganizerURL(
  value: string,
  flow: OrganizerExpectation["flow"],
) {
  const url = new URL(value);
  const allowed =
    flow === "connect" ? ["connect.stripe.com"] : ["checkout.stripe.com"];
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !allowed.includes(url.hostname)
  )
    throw new Error("INVALID_STRIPE_LINK");
  return url.toString();
}
export function validateOrganizerCallback(
  value: string,
  expected: OrganizerExpectation,
) {
  const url = new URL(value),
    target = new URL(NATIVE_ORGANIZER_RETURN);
  const data = parseOrganizerReturn(url.searchParams);
  if (
    url.protocol !== target.protocol ||
    url.host !== target.host ||
    url.pathname !== target.pathname ||
    url.username ||
    url.password ||
    !data ||
    data.flow !== expected.flow ||
    (data.flow === "promotion" &&
      expected.flow === "promotion" &&
      data.campaignId !== expected.campaignId)
  )
    throw new Error("INVALID_ORGANIZER_RETURN");
  return data;
}
export function parsePromotionStatus(
  value: unknown,
  campaignId: string,
): OrganizerPaymentStatus {
  const result = value as { campaignId?: string; status?: string } | null;
  if (
    result?.campaignId !== campaignId ||
    ![
      "pending_payment",
      "scheduled",
      "active",
      "completed",
      "cancelled",
    ].includes(result.status ?? "")
  )
    throw new Error("INVALID_PROMOTION_STATUS");
  return result.status as OrganizerPaymentStatus;
}
export function parsePromotionReconciliation(
  value: unknown,
  campaignId: string,
): OrganizerReconciliation {
  const status = parsePromotionStatus(value, campaignId),
    url = (value as { checkoutUrl?: unknown }).checkoutUrl;
  if (
    url !== undefined &&
    (typeof url !== "string" || status !== "pending_payment")
  )
    throw new Error("INVALID_PROMOTION_RESUME");
  return {
    status,
    ...(typeof url === "string"
      ? { checkoutUrl: validateOrganizerURL(url, "promotion") }
      : {}),
  };
}
export function parseConnectStatus(value: unknown): OrganizerPaymentStatus {
  const result = value as {
    stripeChargesEnabled?: unknown;
    stripePayoutsEnabled?: unknown;
  } | null;
  if (
    !result ||
    typeof result.stripeChargesEnabled !== "boolean" ||
    typeof result.stripePayoutsEnabled !== "boolean"
  )
    throw new Error("INVALID_CONNECT_STATUS");
  return result.stripeChargesEnabled && result.stripePayoutsEnabled
    ? "connected"
    : "incomplete";
}

/** One operation at a time; a redirect never produces a successful payment state. */
export function createOrganizerFlow(options: {
  session(): string | null;
  prepare(): OrganizerBrowser;
  publish(state: OrganizerFlowState): void;
}) {
  let version = 0,
    busy = false,
    browser: OrganizerBrowser | undefined;
  let state: OrganizerFlowState = { busy: false, error: false };
  const publish = (next: OrganizerFlowState) => {
    state = next;
    options.publish(state);
  };
  async function execute(
    reconcile: (
      expected: OrganizerExpectation,
    ) => Promise<OrganizerReconciliation>,
    expected?: OrganizerExpectation,
    create?: () => Promise<{ url: string; expected: OrganizerExpectation }>,
  ) {
    const session = options.session();
    if (busy || !session) return;
    busy = true;
    const attempt = ++version,
      current = () => attempt === version && session === options.session();
    publish({ busy: true, error: false, expected });
    try {
      if (create) {
        // Web must reserve its popup in the click handler before the network request.
        browser = options.prepare();
        const created = await create();
        if (!current()) return;
        expected = created.expected;
        publish({ busy: true, error: false, expected });
        await browser.open(
          validateOrganizerURL(created.url, expected.flow),
          expected,
        );
        if (!current()) return;
      }
      if (!expected) throw new Error("MISSING_ORGANIZER_OPERATION");
      const result = await reconcile(expected);
      if (current())
        publish({
          busy: false,
          error: false,
          expected,
          ...(typeof result === "string" ? { status: result } : result),
        });
    } catch {
      if (current()) publish({ busy: false, error: true, expected });
    } finally {
      if (attempt === version) {
        browser?.dispose();
        browser = undefined;
        busy = false;
        if (!current()) publish({ busy: false, error: false });
      }
    }
  }
  return {
    start: (
      create: () => Promise<{ url: string; expected: OrganizerExpectation }>,
      reconcile: (
        expected: OrganizerExpectation,
      ) => Promise<OrganizerReconciliation>,
    ) => execute(reconcile, undefined, create),
    refresh: (
      expected: OrganizerExpectation,
      reconcile: (
        expected: OrganizerExpectation,
      ) => Promise<OrganizerReconciliation>,
    ) => execute(reconcile, expected),
    cancel() {
      version++;
      busy = false;
      browser?.dispose();
      browser = undefined;
      publish({ busy: false, error: false });
    },
  };
}
