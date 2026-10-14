ALTER TABLE "cloud_agent_bootstrap" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cloud_agent_bootstrap" ADD COLUMN "protocol_version" integer;--> statement-breakpoint
ALTER TABLE "cloud_agent_bootstrap" ADD COLUMN "remote_version" text;