ALTER TABLE "cloud_agent_runs" ADD COLUMN "model_fallback_from" text;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cloud_agent_model_id" text;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_model_shape" CHECK (num_nonnulls("cloud_agent_runs"."model_id", "cloud_agent_runs"."model_fallback_from") <= 1);--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_cloud_agent_model_id_length" CHECK ("servers"."cloud_agent_model_id" is null or char_length("servers"."cloud_agent_model_id") between 1 and 200);