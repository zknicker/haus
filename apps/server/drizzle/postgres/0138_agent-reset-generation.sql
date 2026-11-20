ALTER TABLE "agents" ADD COLUMN "reset_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD COLUMN "reset_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_pushes" ADD COLUMN "reset_generation" integer DEFAULT 0 NOT NULL;