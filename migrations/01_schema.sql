CREATE TYPE user_role AS ENUM (
  'admin',
  'moderator',
  'user'
);

CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE user_profiles (
  profile_id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE,
  first_name VARCHAR(50),
  last_name VARCHAR(50),
  phone VARCHAR(20),
  birth_date DATE
);

CREATE TABLE event_categories (
  category_id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT
);

CREATE TABLE events (
  event_id SERIAL PRIMARY KEY,
  category_id INTEGER,
  title VARCHAR(100) NOT NULL,
  description TEXT,
  event_date TIMESTAMP NOT NULL,
  duration INTERVAL,
  capacity INTEGER NOT NULL,
  ticket_price DECIMAL(10,2) NOT NULL,
  created_by INTEGER,
  status VARCHAR(20) DEFAULT 'planned'
);

CREATE TABLE club_zones (
  zone_id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  capacity INTEGER NOT NULL
);

CREATE TABLE seats (
  seat_id SERIAL PRIMARY KEY,
  zone_id INTEGER,
  seat_number VARCHAR(10) NOT NULL
);

CREATE TABLE bookings (
  booking_id SERIAL PRIMARY KEY,
  user_id INTEGER,
  event_id INTEGER,
  seat_id INTEGER,
  booking_date TIMESTAMP DEFAULT (CURRENT_TIMESTAMP),
  status VARCHAR(20) DEFAULT 'pending'
);

CREATE TABLE transactions (
  transaction_id SERIAL PRIMARY KEY,
  booking_id INTEGER UNIQUE,
  user_id INTEGER,
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50),
  transaction_date TIMESTAMP DEFAULT (CURRENT_TIMESTAMP),
  status VARCHAR(20) DEFAULT 'pending'
);

CREATE TABLE audit_logs (
  log_id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action VARCHAR(100) NOT NULL,
  action_date TIMESTAMP DEFAULT (CURRENT_TIMESTAMP),
  details JSONB
);

CREATE INDEX idx_events_date ON events (event_date);

CREATE UNIQUE INDEX ON seats (zone_id, seat_number);

CREATE UNIQUE INDEX ON bookings (event_id, seat_id);

CREATE INDEX idx_bookings_user ON bookings (user_id);

CREATE INDEX idx_bookings_event ON bookings (event_id);

CREATE INDEX idx_transactions_date ON transactions (transaction_date);

ALTER TABLE user_profiles ADD FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE;

ALTER TABLE events ADD FOREIGN KEY (category_id) REFERENCES event_categories (category_id);

ALTER TABLE events ADD FOREIGN KEY (created_by) REFERENCES users (user_id);

ALTER TABLE seats ADD FOREIGN KEY (zone_id) REFERENCES club_zones (zone_id) ON DELETE CASCADE;

ALTER TABLE bookings ADD FOREIGN KEY (user_id) REFERENCES users (user_id);

ALTER TABLE bookings ADD FOREIGN KEY (event_id) REFERENCES events (event_id);

ALTER TABLE bookings ADD FOREIGN KEY (seat_id) REFERENCES seats (seat_id);

ALTER TABLE transactions ADD FOREIGN KEY (booking_id) REFERENCES bookings (booking_id);

ALTER TABLE transactions ADD FOREIGN KEY (user_id) REFERENCES users (user_id);

ALTER TABLE audit_logs ADD FOREIGN KEY (user_id) REFERENCES users (user_id);