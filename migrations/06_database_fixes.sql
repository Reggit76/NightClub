-- Скрипт исправления базы данных Night Club Booking System
-- Исправляет проблемы с таблицами и добавляет недостающие столбцы

-- 1. Исправляем таблицу transactions
-- Проверяем и добавляем недостающие столбцы

-- Добавляем user_id если не существует
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' AND column_name = 'user_id'
    ) THEN
        ALTER TABLE transactions ADD COLUMN user_id INTEGER REFERENCES users(user_id);
        -- Заполняем user_id из связанных bookings
        UPDATE transactions 
        SET user_id = (
            SELECT b.user_id 
            FROM bookings b 
            WHERE b.booking_id = transactions.booking_id
        )
        WHERE user_id IS NULL;
    END IF;
END $$;

-- Переименовываем created_at в transaction_date если нужно
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' AND column_name = 'created_at'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' AND column_name = 'transaction_date'
    ) THEN
        ALTER TABLE transactions RENAME COLUMN created_at TO transaction_date;
    END IF;
END $$;

-- Добавляем transaction_date если не существует
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' AND column_name = 'transaction_date'
    ) THEN
        ALTER TABLE transactions ADD COLUMN transaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- 2. Исправляем таблицу bookings
-- Добавляем booking_date если не существует
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'booking_date'
    ) THEN
        ALTER TABLE bookings ADD COLUMN booking_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Переименовываем created_at в booking_date если нужно
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'created_at'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'bookings' AND column_name = 'booking_date'
    ) THEN
        ALTER TABLE bookings RENAME COLUMN created_at TO booking_date;
    END IF;
END $$;

-- 3. Проверяем и создаем таблицу event_zones если не существует
CREATE TABLE IF NOT EXISTS event_zones (
    event_zone_id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    zone_id INTEGER NOT NULL REFERENCES club_zones(zone_id) ON DELETE CASCADE,
    available_seats INTEGER NOT NULL DEFAULT 0,
    zone_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, zone_id)
);

-- 4. Исправляем таблицу audit_logs
-- Переименовываем action_date в created_at если нужно
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'action_date'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE audit_logs RENAME COLUMN action_date TO created_at;
    END IF;
END $$;

-- Добавляем created_at если не существует
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'audit_logs' AND column_name = 'created_at'
    ) THEN
        ALTER TABLE audit_logs ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- 5. Создаем индексы для производительности
CREATE INDEX IF NOT EXISTS idx_transactions_booking ON transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bookings_user_date ON bookings(user_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_event_zones_event ON event_zones(event_id);
CREATE INDEX IF NOT EXISTS idx_event_zones_zone ON event_zones(zone_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at);

-- 6. Обновляем внешние ключи если нужно
DO $$ 
BEGIN
    -- Добавляем внешний ключ для user_id в transactions если не существует
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'transactions' 
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'user_id'
    ) THEN
        ALTER TABLE transactions ADD CONSTRAINT fk_transactions_user_id 
        FOREIGN KEY (user_id) REFERENCES users(user_id);
    END IF;
END $$;

-- 7. Добавляем тестовые данные если таблицы пустые
-- Проверяем существование админа
INSERT INTO users (username, email, password_hash, role) 
VALUES ('admin', 'admin@nightclub.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewreN9pksVYC9ESe', 'admin')
ON CONFLICT (username) DO NOTHING;

-- Добавляем профиль для админа
INSERT INTO user_profiles (user_id, first_name, last_name)
SELECT u.user_id, 'Администратор', 'Системы'
FROM users u 
WHERE u.username = 'admin'
ON CONFLICT (user_id) DO NOTHING;

-- Добавляем тестового пользователя
INSERT INTO users (username, email, password_hash, role) 
VALUES ('user123', 'user@test.com', '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'user')
ON CONFLICT (username) DO NOTHING;

-- Добавляем профиль для тестового пользователя
INSERT INTO user_profiles (user_id, first_name, last_name)
SELECT u.user_id, 'Тестовый', 'Пользователь'
FROM users u 
WHERE u.username = 'user123'
ON CONFLICT (user_id) DO NOTHING;

-- Добавляем категории событий
INSERT INTO event_categories (name, description) VALUES 
('Концерт', 'Живые музыкальные выступления'),
('Вечеринка', 'Тематические вечеринки и дискотеки'),
('Корпоратив', 'Корпоративные мероприятия'),
('Караоке', 'Вечера караоке'),
('Stand-up', 'Комедийные выступления')
ON CONFLICT (name) DO NOTHING;

-- Добавляем зоны клуба
INSERT INTO club_zones (name, description, capacity) VALUES 
('VIP Зона', 'Премиальная зона с лучшими местами', 20),
('Основной зал', 'Главная танцевальная зона', 100),
('Барная зона', 'Места у бара', 30),
('Лаунж', 'Уютная зона для отдыха', 40)
ON CONFLICT (name) DO NOTHING;

-- Добавляем места для каждой зоны
-- VIP зона
INSERT INTO seats (zone_id, seat_number)
SELECT z.zone_id, 'VIP-' || LPAD(series.i::text, 2, '0')
FROM club_zones z, generate_series(1, 20) AS series(i)
WHERE z.name = 'VIP Зона'
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- Основной зал
INSERT INTO seats (zone_id, seat_number)
SELECT z.zone_id, 'MH-' || LPAD(series.i::text, 3, '0')
FROM club_zones z, generate_series(1, 100) AS series(i)
WHERE z.name = 'Основной зал'
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- Барная зона
INSERT INTO seats (zone_id, seat_number)
SELECT z.zone_id, 'BAR-' || LPAD(series.i::text, 2, '0')
FROM club_zones z, generate_series(1, 30) AS series(i)
WHERE z.name = 'Барная зона'
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- Лаунж
INSERT INTO seats (zone_id, seat_number)
SELECT z.zone_id, 'LNG-' || LPAD(series.i::text, 2, '0')
FROM club_zones z, generate_series(1, 40) AS series(i)
WHERE z.name = 'Лаунж'
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- 8. Создаем тестовое мероприятие если нет мероприятий
DO $$
DECLARE
    event_exists INTEGER;
    admin_id INTEGER;
    category_id INTEGER;
    event_id INTEGER;
BEGIN
    SELECT COUNT(*) INTO event_exists FROM events;
    
    IF event_exists = 0 THEN
        -- Получаем ID админа
        SELECT user_id INTO admin_id FROM users WHERE username = 'admin';
        
        -- Получаем ID категории
        SELECT category_id INTO category_id FROM event_categories WHERE name = 'Вечеринка' LIMIT 1;
        
        -- Создаем тестовое мероприятие
        INSERT INTO events (category_id, title, description, event_date, duration, capacity, ticket_price, created_by, status)
        VALUES (
            category_id,
            'Тестовая вечеринка',
            'Демонстрационное мероприятие для тестирования системы',
            NOW() + INTERVAL '7 days',
            '3 hours'::interval,
            50,
            1000.00,
            admin_id,
            'planned'
        )
        RETURNING event_id INTO event_id;
        
        -- Добавляем конфигурацию зон для мероприятия
        INSERT INTO event_zones (event_id, zone_id, available_seats, zone_price)
        SELECT 
            event_id,
            z.zone_id,
            CASE 
                WHEN z.name = 'VIP Зона' THEN 10
                WHEN z.name = 'Основной зал' THEN 30
                WHEN z.name = 'Барная зона' THEN 10
                ELSE 0
            END,
            CASE 
                WHEN z.name = 'VIP Зона' THEN 2000.00
                WHEN z.name = 'Основной зал' THEN 1000.00
                WHEN z.name = 'Барная зона' THEN 1500.00
                ELSE 0.00
            END
        FROM club_zones z
        WHERE z.name IN ('VIP Зона', 'Основной зал', 'Барная зона');
        
        RAISE NOTICE 'Создано тестовое мероприятие с ID: %', event_id;
    END IF;
END $$;

-- 9. Обновляем статистику таблиц
ANALYZE users;
ANALYZE user_profiles;
ANALYZE events;
ANALYZE event_categories;
ANALYZE club_zones;
ANALYZE seats;
ANALYZE bookings;
ANALYZE transactions;
ANALYZE audit_logs;
ANALYZE event_zones;

-- Выводим информацию о состоянии базы
SELECT 
    'users' as table_name, COUNT(*) as records FROM users
UNION ALL
SELECT 'events', COUNT(*) FROM events
UNION ALL
SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'club_zones', COUNT(*) FROM club_zones
UNION ALL
SELECT 'seats', COUNT(*) FROM seats
UNION ALL
SELECT 'event_zones', COUNT(*) FROM event_zones
ORDER BY table_name;

-- Сообщение об успешном завершении
SELECT 'Database successfully fixed and updated!' as status;