-- Fix for event seats database issue
-- Run this script to resolve the 500 error when fetching seats

-- 1. First, let's check what's causing the issue
SELECT 
    'Events without zones' as issue,
    COUNT(*) as count
FROM events e
LEFT JOIN event_zones ez ON e.event_id = ez.event_id
WHERE ez.event_id IS NULL

UNION ALL

SELECT 
    'Zones without seats' as issue,
    COUNT(*) as count
FROM club_zones z
LEFT JOIN seats s ON z.zone_id = s.zone_id
WHERE s.zone_id IS NULL

UNION ALL

SELECT 
    'Event zones without corresponding seats' as issue,
    COUNT(*) as count
FROM event_zones ez
LEFT JOIN seats s ON ez.zone_id = s.zone_id
WHERE s.zone_id IS NULL;

-- 2. Fix missing event_zones data for existing events
-- This creates default zone configurations for events that don't have them
INSERT INTO event_zones (event_id, zone_id, available_seats, zone_price)
SELECT 
    e.event_id,
    z.zone_id,
    LEAST(z.capacity, 50) as available_seats, -- Use minimum of zone capacity or 50
    CASE 
        WHEN z.name ILIKE '%vip%' THEN 2000.00
        WHEN z.name ILIKE '%лаунж%' OR z.name ILIKE '%lounge%' THEN 1500.00
        WHEN z.name ILIKE '%бар%' OR z.name ILIKE '%bar%' THEN 1200.00
        ELSE 1000.00
    END as zone_price
FROM events e
CROSS JOIN club_zones z
WHERE NOT EXISTS (
    SELECT 1 FROM event_zones ez 
    WHERE ez.event_id = e.event_id AND ez.zone_id = z.zone_id
)
AND e.status IN ('planned', 'active'); -- Only for active/planned events

-- 3. Update event capacities to match zone configurations
UPDATE events 
SET capacity = (
    SELECT COALESCE(SUM(ez.available_seats), 0)
    FROM event_zones ez
    WHERE ez.event_id = events.event_id
)
WHERE event_id IN (
    SELECT DISTINCT event_id FROM event_zones
);

-- 4. Ensure all zones have seats
-- Add missing seats for zones that don't have any
INSERT INTO seats (zone_id, seat_number)
SELECT 
    z.zone_id,
    CASE 
        WHEN z.name ILIKE '%vip%' THEN 'VIP-' || LPAD(series.i::text, 2, '0')
        WHEN z.name ILIKE '%лаунж%' OR z.name ILIKE '%lounge%' THEN 'LNG-' || LPAD(series.i::text, 2, '0')
        WHEN z.name ILIKE '%бар%' OR z.name ILIKE '%bar%' THEN 'BAR-' || LPAD(series.i::text, 2, '0')
        WHEN z.name ILIKE '%основн%' OR z.name ILIKE '%main%' THEN 'MH-' || LPAD(series.i::text, 3, '0')
        ELSE 'Z' || z.zone_id || '-' || LPAD(series.i::text, 2, '0')
    END
FROM club_zones z
CROSS JOIN generate_series(1, LEAST(z.capacity, 100)) AS series(i)
WHERE NOT EXISTS (
    SELECT 1 FROM seats s WHERE s.zone_id = z.zone_id
)
ON CONFLICT (zone_id, seat_number) DO NOTHING;

-- 5. Fix any inconsistent data
-- Remove event_zones entries where the zone doesn't have seats
DELETE FROM event_zones 
WHERE zone_id NOT IN (SELECT DISTINCT zone_id FROM seats);

-- 6. Verify the fix
SELECT 
    e.event_id,
    e.title,
    e.status,
    COUNT(ez.zone_id) as zones_count,
    SUM(ez.available_seats) as total_seats,
    e.capacity
FROM events e
LEFT JOIN event_zones ez ON e.event_id = ez.event_id
WHERE e.status IN ('planned', 'active')
GROUP BY e.event_id, e.title, e.status, e.capacity
ORDER BY e.event_id;

-- 7. Show zone and seat distribution
SELECT 
    z.zone_id,
    z.name as zone_name,
    z.capacity as zone_capacity,
    COUNT(s.seat_id) as actual_seats,
    COUNT(ez.event_zone_id) as events_using_zone
FROM club_zones z
LEFT JOIN seats s ON z.zone_id = s.zone_id
LEFT JOIN event_zones ez ON z.zone_id = ez.zone_id
GROUP BY z.zone_id, z.name, z.capacity
ORDER BY z.zone_id;