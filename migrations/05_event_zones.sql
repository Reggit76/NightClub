-- migrations/event-zones-05.sql
-- Добавляем таблицу для связи мероприятий с зонами и их ценами

-- Создаем таблицу event_zones для связи мероприятий с зонами
CREATE TABLE IF NOT EXISTS event_zones (
    event_zone_id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL,
    zone_id INTEGER NOT NULL,
    available_seats INTEGER NOT NULL DEFAULT 0,
    zone_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (zone_id) REFERENCES club_zones(zone_id) ON DELETE CASCADE,
    
    -- Уникальная связь мероприятие-зона
    UNIQUE(event_id, zone_id)
);

-- Создаем индексы для производительности
CREATE INDEX idx_event_zones_event ON event_zones(event_id);
CREATE INDEX idx_event_zones_zone ON event_zones(zone_id);

-- Добавляем поле zone_price в events для совместимости (deprecated)
ALTER TABLE events ADD COLUMN IF NOT EXISTS zone_configuration JSONB;

-- Комментарии к полям
COMMENT ON TABLE event_zones IS 'Конфигурация зон для мероприятий';
COMMENT ON COLUMN event_zones.available_seats IS 'Количество доступных мест в зоне для мероприятия';
COMMENT ON COLUMN event_zones.zone_price IS 'Цена билета в данной зоне для мероприятия';

-- Триггер для обновления общей вместимости мероприятия
CREATE OR REPLACE FUNCTION update_event_capacity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE events 
    SET capacity = (
        SELECT COALESCE(SUM(available_seats), 0) 
        FROM event_zones 
        WHERE event_id = COALESCE(NEW.event_id, OLD.event_id)
    )
    WHERE event_id = COALESCE(NEW.event_id, OLD.event_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Создаем триггеры
DROP TRIGGER IF EXISTS trigger_update_event_capacity_insert ON event_zones;
DROP TRIGGER IF EXISTS trigger_update_event_capacity_update ON event_zones;
DROP TRIGGER IF EXISTS trigger_update_event_capacity_delete ON event_zones;

CREATE TRIGGER trigger_update_event_capacity_insert
    AFTER INSERT ON event_zones
    FOR EACH ROW EXECUTE FUNCTION update_event_capacity();

CREATE TRIGGER trigger_update_event_capacity_update
    AFTER UPDATE ON event_zones
    FOR EACH ROW EXECUTE FUNCTION update_event_capacity();

CREATE TRIGGER trigger_update_event_capacity_delete
    AFTER DELETE ON event_zones
    FOR EACH ROW EXECUTE FUNCTION update_event_capacity();