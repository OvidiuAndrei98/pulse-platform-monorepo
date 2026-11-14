-- +goose Up
ALTER TABLE outing_plan_members ADD COLUMN ticket_status_shared BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE outing_plan_members ADD COLUMN needs_ticket BOOLEAN NOT NULL DEFAULT FALSE;
-- A declined attempt can still be retried in the same Stripe session. Only
-- verified terminal cancellation/expiration releases its recipient protection.
CREATE TABLE checkout_closed_payments (
 order_id UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
 closed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Immutable purchase context survives plan edits/deletion. Financial ownership
-- stays on orders; only the existing transfer acceptance changes ticket ownership.
CREATE TABLE outing_ticket_recipients (
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ordinal SMALLINT NOT NULL CHECK(ordinal BETWEEN 0 AND 7),
  plan_id UUID,
  decision_round INTEGER NOT NULL,
  event_id UUID NOT NULL REFERENCES events(id),
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  ticket_id UUID UNIQUE REFERENCES tickets(id),
  PRIMARY KEY(order_id,ordinal), UNIQUE(order_id,recipient_id)
);
CREATE INDEX outing_recipient_event_idx ON outing_ticket_recipients(event_id,recipient_id);

-- +goose Down
-- Purchase allocations and verified closures protect live payment retries.
-- Require an explicit archive plan before rolling back populated tables. Hold
-- both tables until commit so a new write cannot race an empty-table check.
-- +goose StatementBegin
DO $$ BEGIN
 LOCK TABLE outing_ticket_recipients,checkout_closed_payments IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM outing_ticket_recipients) OR EXISTS(SELECT 1 FROM checkout_closed_payments) THEN
  RAISE EXCEPTION 'OUTING_TICKET_RECIPIENTS_ROLLBACK_REQUIRES_ARCHIVE';
 END IF;
END $$;
-- +goose StatementEnd
DROP TABLE outing_ticket_recipients;
DROP TABLE checkout_closed_payments;
ALTER TABLE outing_plan_members DROP COLUMN needs_ticket;
ALTER TABLE outing_plan_members DROP COLUMN ticket_status_shared;
