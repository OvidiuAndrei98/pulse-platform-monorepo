-- +goose Up
-- Additive indexes; production deployments already stop writers for migrations.
CREATE INDEX tickets_ticket_type_user_idx ON tickets (ticket_type_id, user_id);
CREATE INDEX tickets_order_idx ON tickets (order_id);
CREATE INDEX tickets_user_created_idx ON tickets (user_id, created_at DESC);
CREATE INDEX ticket_types_event_idx ON ticket_types (event_id);
CREATE INDEX orders_event_status_idx ON orders (event_id, status);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);
CREATE INDEX check_ins_event_idx ON check_ins (event_id);
CREATE INDEX events_published_start_idx ON events (start_time DESC, id) WHERE status = 'published';

-- +goose Down
DROP INDEX events_published_start_idx;
DROP INDEX check_ins_event_idx;
DROP INDEX orders_user_created_idx;
DROP INDEX orders_event_status_idx;
DROP INDEX ticket_types_event_idx;
DROP INDEX tickets_user_created_idx;
DROP INDEX tickets_order_idx;
DROP INDEX tickets_ticket_type_user_idx;
