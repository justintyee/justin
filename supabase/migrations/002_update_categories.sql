-- Expands the 5-category set (food, museum, shop, drinks, other) to the
-- 8-category set the app now uses. Run this once against an existing
-- project that was created from the original schema.sql.
--
-- Renaming an enum value updates every row that already uses it, so
-- existing events keep their category with no separate UPDATE needed.
-- 'other' is intentionally left alone: it's no longer offered in the UI,
-- but any existing row with that value stays valid rather than being
-- force-migrated to something it doesn't necessarily mean.

alter type event_category rename value 'museum' to 'museums';
alter type event_category rename value 'shop' to 'stores';

alter type event_category add value if not exists 'daytrip';
alter type event_category add value if not exists 'attractions';
alter type event_category add value if not exists 'cafe';
alter type event_category add value if not exists 'architecture';

alter table events alter column category set default 'food';
