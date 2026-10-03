ALTER TABLE "cloud_agent_runs" ADD COLUMN "model_dropped_params" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD COLUMN "model_fallback_from" text;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD COLUMN "model_params" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cloud_agent_model_id" text;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cloud_agent_model_params" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_model_shape" CHECK (num_nonnulls("cloud_agent_runs"."model_id", "cloud_agent_runs"."model_fallback_from") <= 1);--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_model_params_shape" CHECK (jsonb_typeof("cloud_agent_runs"."model_params") = 'array' and jsonb_typeof("cloud_agent_runs"."model_dropped_params") = 'array' and ("cloud_agent_runs"."model_id" is not null or ("cloud_agent_runs"."model_params" = '[]'::jsonb and "cloud_agent_runs"."model_dropped_params" = '[]'::jsonb)));--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_cloud_agent_model_id_length" CHECK ("servers"."cloud_agent_model_id" is null or char_length("servers"."cloud_agent_model_id") between 1 and 200);--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_cloud_agent_model_params_shape" CHECK (jsonb_typeof("servers"."cloud_agent_model_params") = 'object' and ("servers"."cloud_agent_model_id" is not null or "servers"."cloud_agent_model_params" = '{}'::jsonb));