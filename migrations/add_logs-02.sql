-- Fix audit_logs table - change JSONB to TEXT for compatibility
-- Run this if you encounter issues with JSONB type

-- Drop the existing table if it exists
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Recreate with TEXT instead of JSONB
CREATE TABLE audit_logs (
  log_id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action VARCHAR(100) NOT NULL,
  action_date TIMESTAMP DEFAULT (CURRENT_TIMESTAMP),
  details TEXT
);

-- Add foreign key constraint
ALTER TABLE audit_logs ADD FOREIGN KEY (user_id) REFERENCES users (user_id);

-- Add index for performance
CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_date ON audit_logs (action_date);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);