ALTER TABLE "agent_inbox" ADD COLUMN "addressed_reason" text;--> statement-breakpoint
CREATE INDEX "agent_inbox_addressed_idx" ON "agent_inbox" USING btree ("server_id","agent_id") WHERE "agent_inbox"."addressed_reason" is not null and "agent_inbox"."state" <> 'seen';--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_addressed_reason" CHECK ("agent_inbox"."addressed_reason" is null
                or "agent_inbox"."addressed_reason" in ('dm', 'mention', 'routing'));