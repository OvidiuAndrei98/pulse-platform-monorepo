import test from "node:test";
import assert from "node:assert/strict";
import type { components } from "@packages/api-client/src/schema";
import {
  financeSummary,
  invoiceStats,
  invitationBatches,
  invitationQuantity,
  invitationTickets,
} from "../src/dashboard/managementData";
import { renderInvitationPdf } from "../src/dashboard/invitationPdfHtml";
type S = components["schemas"];
const sale = {
  grossRevenueRon: 1000,
  customerTicketingFeeBani: 5000,
  platformFeeBani: 15000,
  ticketsSold: 20,
  refundsNeedingAttention: 1,
} as S["OrganizerFinanceEventResponse"];
const invitation = (
  id: string,
  batchId: string,
  batchIndex: number,
  status: "active" | "used" | "revoked" = "active",
) =>
  ({
    id,
    batchId,
    batchIndex,
    status,
    label: "Guest list",
    ticketType: "VIP",
    validationHash: id,
  }) as S["InvitationTicketResponse"];
test("finance totals include ticketing fees paid by customers before platform deduction, matching original dashboard", () => {
  const result = financeSummary([sale]);
  assert.equal(result.customerTotal, 1050);
  assert.equal(result.platformFee, 150);
  assert.equal(result.customerTotal - result.platformFee, 900);
  assert.equal(result.tickets, 20);
  assert.equal(result.refunds, 1);
  assert.deepEqual(financeSummary([]), {
    customerTotal: 0,
    platformFee: 0,
    tickets: 0,
    refunds: 0,
  });
});
test("invoice counters include pending or failed refund documents without double counting an invoice", () => {
  const rows = [
    { status: "issued", refundStatus: "processing" },
    { status: "failed", refundStatus: "failed" },
    { status: "issued", refundStatus: "needs_review" },
    { status: "pending" },
  ] as S["BillingInvoiceResponse"][];
  assert.deepEqual(invoiceStats(rows), {
    issued: 2,
    inProgress: 2,
    attention: 2,
  });
  assert.deepEqual(invoiceStats([]), {
    issued: 0,
    inProgress: 0,
    attention: 0,
  });
});
test("invitations remain grouped by issuance batch and sort by index without changing API data", () => {
  const rows = [
    invitation("3", "a", 3),
    invitation("1", "a", 1),
    invitation("2", "b", 1),
    invitation("4", "", 1),
  ];
  const groups = invitationBatches(rows);
  assert.deepEqual(
    groups.map((group) => [group.id, group.items.map((item) => item.id)]),
    [
      ["a", ["1", "3"]],
      ["b", ["2"]],
      ["4", ["4"]],
    ],
  );
  assert.deepEqual(
    rows.map((item) => item.id),
    ["3", "1", "2", "4"],
  );
});
test("invitation quantity uses original bounded normalization and exports only active complimentary tickets", () => {
  for (const value of ["", "x", "-100", "0"])
    assert.equal(invitationQuantity(value), 1);
  assert.equal(invitationQuantity("999"), 100);
  assert.equal(invitationQuantity("4.5"), 4);
  const result = invitationTickets(
    {
      title: "Club night",
      startTime: "2035-01-01T20:00:00Z",
      locationName: "Club",
    },
    [
      invitation("b", "one", 2),
      invitation("a", "one", 1),
      invitation("used", "one", 3, "used"),
      invitation("revoked", "one", 4, "revoked"),
    ],
    "General",
  );
  assert.deepEqual(
    result.map((ticket) => ticket.id),
    ["a", "b"],
  );
  assert.ok(
    result.every(
      (ticket) =>
        ticket.ticketPriceBani === 0 &&
        ticket.ticketingFeeBani === 0 &&
        ticket.paidTotalBani === 0,
    ),
  );
});
test("native batch PDF uses original ticket template for every active ticket, escapes user data and rejects mismatched QR pages", () => {
  const tickets = invitationTickets(
    {
      title: "<script>unsafe</script>",
      startTime: "2035-01-01T20:00:00Z",
      locationName: "Club",
    },
    [invitation("a", "a", 1), invitation("b", "a", 2)],
    "General",
  );
  const html = renderInvitationPdf(
    tickets,
    ["data:image/png;base64,YQ==", "data:image/png;base64,Yg=="],
    (key) => key,
    "en",
  );
  assert.equal((html.match(/data-ticket-pdf="true"/g) ?? []).length, 2);
  assert.ok(html.includes("page-break-after:always"));
  assert.ok(!html.includes("<script>unsafe"));
  assert.ok(html.includes("&lt;script&gt;unsafe"));
  assert.throws(
    () => renderInvitationPdf(tickets, [], (key) => key, "en"),
    /INVALID_INVITATION_PAGES/,
  );
  assert.throws(
    () =>
      renderInvitationPdf(
        tickets,
        ["javascript:bad", "data:image/png;base64,YQ=="],
        (key) => key,
        "en",
      ),
    /INVALID_TICKET_QR_IMAGE/,
  );
});
