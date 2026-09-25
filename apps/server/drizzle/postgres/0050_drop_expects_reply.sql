ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_expects_reply";--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP COLUMN "expects_reply";--> statement-breakpoint
UPDATE "chat_messages" SET "delivery_routing" = "delivery_routing" - 'expectsReply' WHERE "delivery_routing" -> 'expectsReply' IS NOT NULL;