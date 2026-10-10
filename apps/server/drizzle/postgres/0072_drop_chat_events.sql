DROP TABLE IF EXISTS "chat_events" CASCADE;--> statement-breakpoint
ALTER TABLE "servers" DROP CONSTRAINT IF EXISTS "servers_nonnegative_chat_event_cursor";--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN IF EXISTS "last_chat_event_cursor";
