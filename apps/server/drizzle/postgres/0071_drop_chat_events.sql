DROP TABLE "chat_events" CASCADE;--> statement-breakpoint
ALTER TABLE "servers" DROP CONSTRAINT "servers_nonnegative_chat_event_cursor";--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN "last_chat_event_cursor";