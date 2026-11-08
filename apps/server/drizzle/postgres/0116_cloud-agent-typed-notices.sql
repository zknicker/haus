ALTER TABLE "agent_inbox" ADD COLUMN "cloud_agent_notice" text;--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD COLUMN "cloud_agent_run_id" text;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD COLUMN "stall_code" text;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD COLUMN "stall_since" timestamp with time zone;--> statement-breakpoint
UPDATE "cloud_agent_runs"
SET
	"stall_code" = "error_code",
	"stall_since" = COALESCE("observed_at", "created_at"),
	"error_code" = NULL
WHERE "status" IN ('queued', 'running')
	AND "error_code" IN ('followup-auto-interrupt-failed', 'claude-prompt-not-found');--> statement-breakpoint
UPDATE "cloud_agent_runs"
SET "error_code" = NULL
WHERE "status" IN ('queued', 'running') AND "error_code" IS NOT NULL;--> statement-breakpoint
DELETE FROM "agent_inbox" AS item
WHERE item."source" = 'cloud_agent_work'
	AND NOT EXISTS (
		SELECT 1 FROM "cloud_agent_runs" AS run
		WHERE run."server_id" = item."server_id"
			AND run."id" = split_part(item."dedupe_key", ':stall:', 1)
	);--> statement-breakpoint
UPDATE "agent_inbox"
SET
	"cloud_agent_run_id" = split_part("dedupe_key", ':stall:', 1),
	"cloud_agent_notice" = CASE WHEN "dedupe_key" LIKE '%:stall:%' THEN 'stall' ELSE 'settled' END
WHERE "source" = 'cloud_agent_work';--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_cloud_agent_run_fk" FOREIGN KEY ("server_id","cloud_agent_run_id") REFERENCES "public"."cloud_agent_runs"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_cloud_agent_notice" CHECK (("agent_inbox"."source" = 'cloud_agent_work') = ("agent_inbox"."cloud_agent_run_id" is not null)
                and ("agent_inbox"."cloud_agent_run_id" is null) = ("agent_inbox"."cloud_agent_notice" is null)
                and ("agent_inbox"."cloud_agent_notice" is null
                    or "agent_inbox"."cloud_agent_notice" in ('settled', 'stall')));--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_error_shape" CHECK ("cloud_agent_runs"."error_code" is null
                or "cloud_agent_runs"."status" in ('pending_input', 'completed', 'failed', 'cancelled', 'expired'));--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_stall_shape" CHECK (("cloud_agent_runs"."stall_code" is null)
                = ("cloud_agent_runs"."stall_since" is null)
                and ("cloud_agent_runs"."stall_code" is null
                    or "cloud_agent_runs"."status" not in ('pending_input', 'completed', 'failed', 'cancelled', 'expired')));