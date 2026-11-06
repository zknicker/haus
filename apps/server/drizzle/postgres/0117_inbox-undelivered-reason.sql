ALTER TABLE "agent_inbox" ADD COLUMN "undelivered_reason" text;--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_undelivered_shape" CHECK ("agent_inbox"."undelivered_reason" is null or ("agent_inbox"."state" = 'seen'
                and char_length("agent_inbox"."undelivered_reason") between 1 and 500));