-- +goose Up
CREATE TABLE ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,          
    price_ron INT NOT NULL,
    capacity INT NOT NULL,               
    tickets_sold INT NOT NULL DEFAULT 0, 
    start_sales TIMESTAMP WITH TIME ZONE NOT NULL,
    end_sales TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_capacity CHECK (tickets_sold <= capacity)
);

CREATE TYPE order_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, 
    event_id UUID NOT NULL REFERENCES events(id),
    email VARCHAR(255) NOT NULL, 
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    status order_status NOT NULL DEFAULT 'pending',
    total_amount INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, 
    validation_hash VARCHAR(64) UNIQUE NOT NULL,
    is_validated BOOLEAN NOT NULL DEFAULT FALSE,
    validated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- +goose Down
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS ticket_types;
