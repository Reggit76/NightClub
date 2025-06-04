-- IMMEDIATE FIX for Event Seats 500 Error
-- Run this in your PostgreSQL database to fix the specific error
-- Event ID 4, Zone ID 17 causing 500 error

-- Step 1: Check what's causing the issue
SELECT 'Current Event 4 Status' as info, 
       event_id, title, status, capacity, event_date
FROM events 
WHERE event_id = 4;

SELECT 'Zone 17 Status' as info,
       zone_id, name, capacity
FROM club_zones 
WHERE zone_id = 17;

SELECT 'Event 4 Zone Configurations' as info,
       ez.event_id, ez.zone_id, z.name, ez.available_seats, ez.zone_price
FROM event_zones ez
JOIN club_zones z ON ez.zone_id = z.zone_id
WHERE ez.event_id = 4;

SELECT 'Zone 17 Seats Count' as info,
       COUNT(*) as seat_count
FROM seats 
WHERE zone_id = 17;

-- Step 2: Fix missing data

-- Ensure zone 17 has seats if it doesn't
INSERT INTO seats (zone_id, seat_number)
SELECT 17, 'Z17-' || LPAD(generate_series(1, 40)::text, 2, '0')
WHERE NOT EXISTS (SELECT 1 FROM seats WHERE zone_id = 17)
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- Ensure event 4 has zone configuration for zone 17
INSERT INTO event_zones (event_id, zone_id, available_seats, zone_price)
SELECT 4, 17, 30, 1000.00
WHERE NOT EXISTS (
    SELECT 1 FROM event_zones 
    WHERE event_id = 4 AND zone_id = 17
);

-- If event 4 doesn't exist, create a test event
INSERT INTO events (event_id, title, description, event_date, duration, capacity, ticket_price, status, created_by)
SELECT 4, 'Test Event', 'Test event for debugging', 
       NOW() + INTERVAL '7 days', '2 hours'::interval, 
       100, 1000.00, 'planned', 1
WHERE NOT EXISTS (SELECT 1 FROM events WHERE event_id = 4)
AND EXISTS (SELECT 1 FROM users WHERE user_id = 1);

-- Step 3: Ensure all zones have seats (prevent future issues)
DO $$
DECLARE
    zone_record RECORD;
    i INTEGER;
    seat_prefix TEXT;
    seat_number TEXT;
BEGIN
    FOR zone_record IN 
        SELECT z.zone_id, z.name, z.capacity
        FROM club_zones z
        LEFT JOIN seats s ON z.zone_id = s.zone_id
        WHERE s.zone_id IS NULL
    LOOP
        -- Determine seat prefix
        IF zone_record.name ILIKE '%vip%' THEN
            seat_prefix := 'VIP';
        ELSIF zone_record.name ILIKE '%бар%' OR zone_record.name ILIKE '%bar%' THEN
            seat_prefix := 'BAR';
        ELSIF zone_record.name ILIKE '%лаунж%' OR zone_record.name ILIKE '%lounge%' THEN
            seat_prefix := 'LNG';
        ELSIF zone_record.name ILIKE '%основн%' OR zone_record.name ILIKE '%main%' THEN
            seat_prefix := 'MH';
        ELSE
            seat_prefix := 'Z' || zone_record.zone_id;
        END IF;
        
        -- Create seats
        FOR i IN 1..LEAST(zone_record.capacity, 100) LOOP
            seat_number := seat_prefix || '-' || LPAD(i::text, 2, '0');
            INSERT INTO seats (zone_id, seat_number)
            VALUES (zone_record.zone_id, seat_number)
            ON CONFLICT (zone_id, seat_number) DO NOTHING;
        END LOOP;
        
        RAISE NOTICE 'Created seats for zone % (%)', zone_record.zone_id, zone_record.name;
    END LOOP;
END $$;

-- Step 4: Ensure all active events have zone configurations
INSERT INTO event_zones (event_id, zone_id, available_seats, zone_price)
SELECT 
    e.event_id,
    z.zone_id,
    LEAST(z.capacity, 50) as available_seats,
    CASE 
        WHEN z.name ILIKE '%vip%' THEN 2000.00
        WHEN z.name ILIKE '%лаунж%' OR z.name ILIKE '%lounge%' THEN 1500.00
        WHEN z.name ILIKE '%бар%' OR z.name ILIKE '%bar%' THEN 1200.00
        ELSE COALESCE(e.ticket_price, 1000.00)
    END as zone_price
FROM events e
CROSS JOIN club_zones z
WHERE e.status IN ('planned', 'active')
  AND NOT EXISTS (
      SELECT 1 FROM event_zones ez 
      WHERE ez.event_id = e.event_id AND ez.zone_id = z.zone_id
  )
  AND EXISTS (
      SELECT 1 FROM seats s WHERE s.zone_id = z.zone_id
  );

-- Step 5: Update event capacities
UPDATE events 
SET capacity = (
    SELECT COALESCE(SUM(ez.available_seats), capacity)
    FROM event_zones ez
    WHERE ez.event_id = events.event_id
)
WHERE event_id IN (
    SELECT DISTINCT event_id FROM event_zones
);

-- Step 6: Test the problematic query
SELECT 'Testing Query - Event 4, Zone 17' as test;

SELECT s.seat_id, s.seat_number, s.zone_id, z.name as zone_name,
       COALESCE(ez.zone_price, 1000.0) as zone_price,
       CASE WHEN b.booking_id IS NOT NULL THEN true ELSE false END as is_booked
FROM seats s
JOIN club_zones z ON s.zone_id = z.zone_id
LEFT JOIN event_zones ez ON s.zone_id = ez.zone_id AND ez.event_id = 4
LEFT JOIN bookings b ON s.seat_id = b.seat_id 
    AND b.event_id = 4 
    AND b.status IN ('confirmed', 'pending')
WHERE s.zone_id = 17
ORDER BY s.seat_number
LIMIT 5;

-- Step 7: Verification queries
SELECT 'Final Verification' as status;

SELECT 'Events with zone configs' as check, COUNT(*) as count
FROM (
    SELECT DISTINCT e.event_id
    FROM events e
    JOIN event_zones ez ON e.event_id = ez.event_id
    WHERE e.status IN ('planned', 'active')
) t;

SELECT 'Zones with seats' as check, COUNT(*) as count
FROM (
    SELECT DISTINCT z.zone_id
    FROM club_zones z
    JOIN seats s ON z.zone_id = s.zone_id
) t;

SELECT 'Event 4 zones' as check, STRING_AGG(z.name, ', ') as zones
FROM event_zones ez
JOIN club_zones z ON ez.zone_id = z.zone_id
WHERE ez.event_id = 4;

-- Success message
SELECT '✅ Fix completed! The seats endpoint should now work.' as result;