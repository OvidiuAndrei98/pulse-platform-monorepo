-- +goose Up
CREATE TYPE verification_status_type AS ENUM ('pending', 'approved', 'rejected');
ALTER TABLE organizer_profiles 
ADD COLUMN verification_status verification_status_type NOT NULL DEFAULT 'pending';


