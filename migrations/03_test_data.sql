-- Create default zones and seats for the nightclub
-- Run this after the main migration to populate basic data
-- Make sure to run fix_zones.sql first if you encounter constraint errors

-- Insert default zones (will be skipped if they already exist)
INSERT INTO club_zones (name, description, capacity) 
SELECT 'VIP Зона', 'Премиальная зона с лучшими местами', 20
WHERE NOT EXISTS (SELECT 1 FROM club_zones WHERE name = 'VIP Зона');

INSERT INTO club_zones (name, description, capacity) 
SELECT 'Основной зал', 'Главная танцевальная зона', 100
WHERE NOT EXISTS (SELECT 1 FROM club_zones WHERE name = 'Основной зал');

INSERT INTO club_zones (name, description, capacity) 
SELECT 'Барная зона', 'Места у бара', 30
WHERE NOT EXISTS (SELECT 1 FROM club_zones WHERE name = 'Барная зона');

INSERT INTO club_zones (name, description, capacity) 
SELECT 'Лаунж', 'Уютная зона для отдыха', 40
WHERE NOT EXISTS (SELECT 1 FROM club_zones WHERE name = 'Лаунж');

-- Insert seats using actual zone IDs from the database
-- VIP Zone seats
INSERT INTO seats (zone_id, seat_number) 
SELECT z.zone_id, 'VIP-' || LPAD(generate_series(1, 20)::text, 2, '0')
FROM club_zones z 
WHERE z.name = 'VIP Зона'
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- Main Hall seats
INSERT INTO seats (zone_id, seat_number) 
SELECT z.zone_id, 'MH-' || LPAD(generate_series(1, 100)::text, 3, '0')
FROM club_zones z 
WHERE z.name = 'Основной зал'
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- Bar Zone seats
INSERT INTO seats (zone_id, seat_number) 
SELECT z.zone_id, 'BAR-' || LPAD(generate_series(1, 30)::text, 2, '0')
FROM club_zones z 
WHERE z.name = 'Барная зона'
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- Lounge seats
INSERT INTO seats (zone_id, seat_number) 
SELECT z.zone_id, 'LNG-' || LPAD(generate_series(1, 40)::text, 2, '0')
FROM club_zones z 
WHERE z.name = 'Лаунж'
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- Insert default event categories
INSERT INTO event_categories (name, description) VALUES 
('Концерт', 'Живые музыкальные выступления'),
('Вечеринка', 'Тематические вечеринки и дискотеки'),
('Корпоратив', 'Корпоративные мероприятия'),
('Частное мероприятие', 'Частные празднования'),
('Караоке', 'Вечера караоке'),
('Stand-up', 'Комедийные выступления')
ON CONFLICT DO NOTHING;

-- Create some sample users for testing (passwords are hashed versions of the indicated passwords)
-- admin / admin123
INSERT INTO users (username, email, password_hash, role) VALUES 
('admin', 'admin@nightclub.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewreN9pksVYC9ESe', 'admin')
ON CONFLICT (username) DO NOTHING;

-- user123 / test123  
INSERT INTO users (username, email, password_hash, role) VALUES 
('user123', 'user@test.com', '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user')
ON CONFLICT (username) DO NOTHING;

-- moderator / mod123
INSERT INTO users (username, email, password_hash, role) VALUES 
('moderator', 'mod@nightclub.com', '$2b$12$2/n0FyPj5jOlGJKnB5qJSef8J0DwYS7g3mDxG9qJQH.zJl8/YOTlG', 'moderator')
ON CONFLICT (username) DO NOTHING;

-- Insert profiles for sample users
INSERT INTO user_profiles (user_id, first_name, last_name) 
SELECT u.user_id, 
       CASE 
         WHEN u.username = 'admin' THEN 'Администратор'
         WHEN u.username = 'user123' THEN 'Тестовый'
         WHEN u.username = 'moderator' THEN 'Модератор'
       END,
       CASE 
         WHEN u.username = 'admin' THEN 'Системы'
         WHEN u.username = 'user123' THEN 'Пользователь'
         WHEN u.username = 'moderator' THEN 'Системы'
       END
FROM users u 
WHERE u.username IN ('admin', 'user123', 'moderator')
ON CONFLICT (user_id) DO NOTHING;

-- Create some sample events
INSERT INTO events (category_id, title, description, event_date, duration, capacity, ticket_price, created_by, status)
SELECT 
    c.category_id,
    CASE 
        WHEN c.name = 'Концерт' THEN 'Живая музыка: Рок-группа "Огни города"'
        WHEN c.name = 'Вечеринка' THEN 'Танцевальная ночь: Лучшие хиты 90-х'
        WHEN c.name = 'Stand-up' THEN 'Комедийный вечер с известными артистами'
    END,
    CASE 
        WHEN c.name = 'Концерт' THEN 'Незабываемый вечер живой музыки от популярной рок-группы'
        WHEN c.name = 'Вечеринка' THEN 'Вспомним лучшие хиты 90-х годов на танцполе'
        WHEN c.name = 'Stand-up' THEN 'Вечер юмора и хорошего настроения'
    END,
    CASE 
        WHEN c.name = 'Концерт' THEN NOW() + INTERVAL '7 days'
        WHEN c.name = 'Вечеринка' THEN NOW() + INTERVAL '14 days'
        WHEN c.name = 'Stand-up' THEN NOW() + INTERVAL '21 days'
    END,
    '3 hours'::interval,
    190, -- Total capacity (sum of all zones)
    CASE 
        WHEN c.name = 'Концерт' THEN 1500.00
        WHEN c.name = 'Вечеринка' THEN 800.00
        WHEN c.name = 'Stand-up' THEN 1200.00
    END,
    u.user_id,
    'planned'
FROM event_categories c
CROSS JOIN (SELECT user_id FROM users WHERE username = 'admin' LIMIT 1) u
WHERE c.name IN ('Концерт', 'Вечеринка', 'Stand-up')
  AND NOT EXISTS (
      SELECT 1 FROM events e2 
      WHERE e2.title = CASE 
          WHEN c.name = 'Концерт' THEN 'Живая музыка: Рок-группа "Огни города"'
          WHEN c.name = 'Вечеринка' THEN 'Танцевальная ночь: Лучшие хиты 90-х'
          WHEN c.name = 'Stand-up' THEN 'Комедийный вечер с известными артистами'
      END
  );

-- Add some indexes for better performance
CREATE INDEX IF NOT EXISTS idx_seats_zone_number ON seats (zone_id, seat_number);
CREATE INDEX IF NOT EXISTS idx_events_status ON events (status);
CREATE INDEX IF NOT EXISTS idx_events_category ON events (category_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings (status);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);

-- Update statistics
ANALYZE club_zones;
ANALYZE seats;
ANALYZE events;
ANALYZE event_categories;
ANALYZE users;
ANALYZE user_profiles;