-- Fix zones constraints and data
-- Run this BEFORE zones_and_seats.sql if you get constraint errors

-- Add unique constraint on zone name if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'club_zones_name_unique'
    ) THEN
        ALTER TABLE club_zones ADD CONSTRAINT club_zones_name_unique UNIQUE (name);
    END IF;
END $$;

-- Clear existing data if needed (only run if you want to start fresh)
-- TRUNCATE TABLE bookings RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE transactions RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE seats RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE club_zones RESTART IDENTITY CASCADE;

-- Alternative approach: Insert zones one by one to ensure they exist
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

-- Verify zones were created
SELECT zone_id, name, capacity FROM club_zones ORDER BY zone_id;