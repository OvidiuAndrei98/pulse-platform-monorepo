-- +goose Up
CREATE TABLE user_hidden_event_categories (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, category)
);

-- +goose Down
DROP TABLE IF EXISTS user_hidden_event_categories;
