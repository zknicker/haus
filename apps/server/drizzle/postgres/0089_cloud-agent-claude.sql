CREATE TABLE "cloud_agent_model_settings" (
	"model_id" text NOT NULL,
	"model_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider" text NOT NULL,
	"server_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cloud_agent_model_settings_pkey" PRIMARY KEY("server_id","provider"),
	CONSTRAINT "cloud_agent_model_settings_provider" CHECK ("cloud_agent_model_settings"."provider" in ('cursor', 'claude')),
	CONSTRAINT "cloud_agent_model_settings_model_id_length" CHECK (char_length("cloud_agent_model_settings"."model_id") between 1 and 200),
	CONSTRAINT "cloud_agent_model_settings_params_shape" CHECK (jsonb_typeof("cloud_agent_model_settings"."model_params") = 'object')
);
--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" DROP CONSTRAINT "cloud_agent_runs_status";--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" DROP CONSTRAINT "cloud_agent_runs_terminal_shape";--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_provider";--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_status";--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_terminal_shape";--> statement-breakpoint
ALTER TABLE "servers" DROP CONSTRAINT "servers_cloud_agent_model_id_length";--> statement-breakpoint
ALTER TABLE "servers" DROP CONSTRAINT "servers_cloud_agent_model_params_shape";--> statement-breakpoint
DROP INDEX "cloud_agent_work_active_idx";--> statement-breakpoint
ALTER TABLE "cloud_agent_model_settings" ADD CONSTRAINT "cloud_agent_model_settings_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_agent_work_active_idx" ON "cloud_agent_work" USING btree ("server_id","created_at") WHERE "cloud_agent_work"."status" in ('queued', 'running', 'pending_input');--> statement-breakpoint
-- Each provider keeps its own model; the Server's existing choice was Cursor's.
INSERT INTO "cloud_agent_model_settings" ("server_id", "provider", "model_id", "model_params")
SELECT "id", 'cursor', "cloud_agent_model_id", "cloud_agent_model_params"
FROM "servers"
WHERE "cloud_agent_model_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN "cloud_agent_model_id";--> statement-breakpoint
ALTER TABLE "servers" DROP COLUMN "cloud_agent_model_params";--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_status" CHECK ("cloud_agent_runs"."status" in ('queued', 'running', 'pending_input', 'completed', 'failed', 'cancelled', 'expired'));--> statement-breakpoint
ALTER TABLE "cloud_agent_runs" ADD CONSTRAINT "cloud_agent_runs_terminal_shape" CHECK (("cloud_agent_runs"."status" in ('pending_input', 'completed', 'failed', 'cancelled', 'expired'))
                = ("cloud_agent_runs"."terminal_at" is not null));--> statement-breakpoint
ALTER TABLE "cloud_agent_work" ADD CONSTRAINT "cloud_agent_work_provider" CHECK ("cloud_agent_work"."provider" in ('cursor', 'claude'));--> statement-breakpoint
ALTER TABLE "cloud_agent_work" ADD CONSTRAINT "cloud_agent_work_status" CHECK ("cloud_agent_work"."status" in ('queued', 'running', 'pending_input', 'completed', 'failed', 'cancelled', 'expired'));--> statement-breakpoint
ALTER TABLE "cloud_agent_work" ADD CONSTRAINT "cloud_agent_work_terminal_shape" CHECK (("cloud_agent_work"."status" in ('pending_input', 'completed', 'failed', 'cancelled', 'expired'))
                = ("cloud_agent_work"."terminal_at" is not null));