CREATE TABLE "cloud_agent_settings" (
	"server_id" text NOT NULL,
	"provider" text NOT NULL,
	"model_id" text,
	"model_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "cloud_agent_settings_server_id_provider_pk" PRIMARY KEY("server_id","provider"),
	CONSTRAINT "cloud_agent_settings_provider" CHECK ("cloud_agent_settings"."provider" in ('cursor','claude')),
	CONSTRAINT "cloud_agent_settings_model_length" CHECK ("cloud_agent_settings"."model_id" is null or char_length("cloud_agent_settings"."model_id") between 1 and 200),
	CONSTRAINT "cloud_agent_settings_params_shape" CHECK (jsonb_typeof("cloud_agent_settings"."model_params") = 'object' and ("cloud_agent_settings"."model_id" is not null or "cloud_agent_settings"."model_params" = '{}'::jsonb))
);
--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" DROP CONSTRAINT "cloud_agent_runs_status";--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_status";--> statement-breakpoint
ALTER TABLE "servers" DROP CONSTRAINT "servers_cloud_agent_model_id_length";--> statement-breakpoint
ALTER TABLE "servers" DROP CONSTRAINT "servers_cloud_agent_model_params_shape";--> statement-breakpoint
ALTER TABLE "cloud_agent_settings" ADD CONSTRAINT "cloud_agent_settings_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "cloud_agent_settings" ("server_id", "provider", "model_id", "model_params") SELECT "id", 'cursor', "cloud_agent_model_id", "cloud_agent_model_params" FROM "servers";--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN "cloud_agent_model_id";--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN "cloud_agent_model_params";--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_status" CHECK ("cloud_agent_runs"."status" in ('queued', 'running', 'pending_input', 'completed', 'failed', 'cancelled', 'expired'));--> statement-breakpoint
ALTER TABLE "cloud_agent_work" ADD CONSTRAINT "cloud_agent_work_status" CHECK ("cloud_agent_work"."status" in ('queued', 'running', 'pending_input', 'completed', 'failed', 'cancelled', 'expired'));