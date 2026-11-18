ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_cloud_agent_notice";--> statement-breakpoint
ALTER TABLE "reminders" DROP CONSTRAINT "reminders_anchor_message_fk";
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_anchor_message_fk" FOREIGN KEY ("server_id","anchor_message_id") REFERENCES "public"."chat_messages"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_cloud_agent_notice" CHECK (("agent_inbox"."source" = 'cloud_agent_work') = ("agent_inbox"."cloud_agent_notice" is not null)
                and ("agent_inbox"."cloud_agent_notice" is null
                    or "agent_inbox"."cloud_agent_notice" in ('settled', 'stall', 'pull_request'))
                and ("agent_inbox"."cloud_agent_run_id" is null or "agent_inbox"."cloud_agent_notice" is not null)
                and ("agent_inbox"."cloud_agent_run_id" is not null
                    or "agent_inbox"."cloud_agent_notice" is null
                    or "agent_inbox"."cloud_agent_notice" = 'pull_request'));--> statement-breakpoint
-- ADR 0052 decision 16: a reminder on a Task with no posts anchors on the
-- Task's origin Message, which lives in the parent Channel, so the anchor
-- Message key no longer names the anchor Chat. Server purge still removes
-- both together, so the key stays checked at commit (0002's rule).
ALTER TABLE "reminders" ALTER CONSTRAINT "reminders_anchor_message_fk" DEFERRABLE INITIALLY DEFERRED;
