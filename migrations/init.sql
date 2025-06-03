-- Create users table
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    profile_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    phone VARCHAR(20),
    birth_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create event_categories table
CREATE TABLE IF NOT EXISTS event_categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create club_zones table
CREATE TABLE IF NOT EXISTS club_zones (
    zone_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    capacity INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
    event_id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES event_categories(category_id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    duration INTERVAL NOT NULL,
    capacity INTEGER NOT NULL,
    ticket_price DECIMAL(10,2) NOT NULL,
    created_by INTEGER REFERENCES users(user_id),
    status VARCHAR(20) DEFAULT 'planned',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create event_zones table
CREATE TABLE IF NOT EXISTS event_zones (
    event_zone_id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(event_id) ON DELETE CASCADE,
    zone_id INTEGER REFERENCES club_zones(zone_id),
    available_seats INTEGER NOT NULL,
    zone_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create seats table
CREATE TABLE IF NOT EXISTS seats (
    seat_id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES club_zones(zone_id),
    seat_number VARCHAR(10) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(zone_id, seat_number)
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
    booking_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    event_id INTEGER REFERENCES events(event_id),
    seat_id INTEGER REFERENCES seats(seat_id),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id SERIAL PRIMARY KEY,
    booking_id INTEGER REFERENCES bookings(booking_id),
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

-- Insert default admin user
INSERT INTO users (username, email, password_hash, role)
VALUES (
    'admin',
    'admin@nightclub.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewFX.gtkv4iXTQri', -- password: admin123
    'admin'
) ON CONFLICT DO NOTHING;

-- Insert default categories
INSERT INTO event_categories (name, description)
VALUES 
    ('Концерт', 'Живые выступления артистов'),
    ('Вечеринка', 'Тематические вечеринки'),
    ('Шоу', 'Развлекательные программы')
ON CONFLICT DO NOTHING;

-- Insert default zones
INSERT INTO club_zones (name, description, capacity)
VALUES 
    ('VIP', 'VIP зона с лучшим видом', 20),
    ('Танцпол', 'Основная танцевальная зона', 100),
    ('Балкон', 'Верхний уровень с хорошим обзором', 30)
ON CONFLICT DO NOTHING;

-- Function to generate seats for a zone
CREATE OR REPLACE FUNCTION generate_zone_seats(zone_id_param INTEGER, num_seats INTEGER)
RETURNS void AS $$
DECLARE
    i INTEGER;
BEGIN
    FOR i IN 1..num_seats LOOP
        INSERT INTO seats (zone_id, seat_number)
        VALUES (zone_id_param, LPAD(i::text, 3, '0'))
        ON CONFLICT DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Generate seats for each zone
DO $$ 
BEGIN
    PERFORM generate_zone_seats(
        (SELECT zone_id FROM club_zones WHERE name = 'VIP'),
        20
    );

    PERFORM generate_zone_seats(
        (SELECT zone_id FROM club_zones WHERE name = 'Танцпол'),
        100
    );

    PERFORM generate_zone_seats(
        (SELECT zone_id FROM club_zones WHERE name = 'Балкон'),
        30
    );
END $$; 