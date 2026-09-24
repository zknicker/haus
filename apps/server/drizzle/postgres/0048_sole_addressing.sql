ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_addressed_reason";--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_addressed_reason" CHECK ("agent_inbox"."addressed_reason" is null
                or "agent_inbox"."addressed_reason" in ('dm', 'mention', 'routing', 'sole'));