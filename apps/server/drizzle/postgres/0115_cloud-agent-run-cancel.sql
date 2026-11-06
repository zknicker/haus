ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_cancel_shape";--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_cancel_agent_fk";
--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_cancel_membership_fk";
--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD COLUMN "cancel_requested_by_agent_id" text;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD COLUMN "cancel_requested_by_user_id" text;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_cancel_agent_fk" FOREIGN KEY ("server_id","cancel_requested_by_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_cancel_membership_fk" FOREIGN KEY ("server_id","cancel_requested_by_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
UPDATE "cloud_agent_runs" AS run
SET
	"cancel_requested_at" = work."cancel_requested_at",
	"cancel_requested_by_agent_id" = work."cancel_requested_by_agent_id",
	"cancel_requested_by_user_id" = work."cancel_requested_by_user_id"
FROM "cloud_agent_work" AS work
WHERE work."server_id" = run."server_id"
	AND work."id" = run."work_id"
	AND work."cancel_requested_at" IS NOT NULL
	AND (
		run."status" IN ('queued', 'running')
		OR run."id" = (
			SELECT newest."id"
			FROM "cloud_agent_runs" AS newest
			WHERE newest."server_id" = run."server_id" AND newest."work_id" = run."work_id"
			ORDER BY newest."created_at" DESC
			LIMIT 1
		)
	);--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP COLUMN "cancel_requested_at";--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP COLUMN "cancel_requested_by_agent_id";--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP COLUMN "cancel_requested_by_user_id";--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_cancel_shape" CHECK (("cloud_agent_runs"."cancel_requested_at" is not null) = (num_nonnulls(
                "cloud_agent_runs"."cancel_requested_by_user_id", "cloud_agent_runs"."cancel_requested_by_agent_id"
            ) = 1));