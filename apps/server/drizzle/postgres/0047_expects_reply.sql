ALTER TABLE "agent_inbox" ADD COLUMN "expects_reply" real;--> statement-breakpoint
CREATE INDEX "agent_inbox_exact_visibility_run_idx" ON "agent_inbox_exact_visibility" USING btree ("agent_id","served_run_id");--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_expects_reply" CHECK ("agent_inbox"."expects_reply" is null
                or ("agent_inbox"."expects_reply" >= 0 and "agent_inbox"."expects_reply" <= 1));