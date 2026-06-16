-- Driven Talent — Internal team events on the calendar (CR #10a)
--
-- The calendar previously only carried client/external-leaning tracks plus a
-- generic 'custom'. This adds a first-class 'internal' kind so team meetings
-- and internal deadlines get their own track (color/label) in the UI.
--
-- `ALTER TYPE ... ADD VALUE` is additive and irreversible; `IF NOT EXISTS`
-- makes it safe to re-run. The new value is appended to the enum; display
-- order is controlled in the app (TRACK_ORDER / rank), not the enum order.

alter type calendar_event_kind add value if not exists 'internal';
