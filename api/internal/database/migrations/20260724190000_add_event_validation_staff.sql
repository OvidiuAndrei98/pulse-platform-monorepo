-- +goose Up
CREATE TABLE event_validation_staff (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX event_validation_staff_user_id_idx ON event_validation_staff(user_id);

-- +goose Down
DROP INDEX IF EXISTS event_validation_staff_user_id_idx;
DROP TABLE IF EXISTS event_validation_staff;
