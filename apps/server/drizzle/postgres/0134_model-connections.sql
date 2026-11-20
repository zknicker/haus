CREATE TABLE "model_connections" (
	"auth_kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"provider" text NOT NULL,
	"sealed_credential" jsonb NOT NULL,
	"server_id" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"status_detail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"web_search" boolean DEFAULT true NOT NULL,
	CONSTRAINT "model_connections_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "model_connections_label_key" UNIQUE("server_id","provider","label"),
	CONSTRAINT "model_connections_provider" CHECK ("model_connections"."provider" in ('claude', 'chatgpt', 'xai', 'gemini', 'openrouter')),
	CONSTRAINT "model_connections_auth_kind" CHECK (("model_connections"."provider" = 'claude' and "model_connections"."auth_kind" = 'setup-token')
                or ("model_connections"."provider" = 'chatgpt' and "model_connections"."auth_kind" = 'oauth')
                or ("model_connections"."provider" = 'xai' and "model_connections"."auth_kind" in ('oauth', 'api-key'))
                or ("model_connections"."provider" in ('gemini', 'openrouter') and "model_connections"."auth_kind" = 'api-key')),
	CONSTRAINT "model_connections_status" CHECK ("model_connections"."status" in ('ready', 'failed')),
	CONSTRAINT "model_connections_position" CHECK ("model_connections"."position" >= 0),
	CONSTRAINT "model_connections_label_length" CHECK (char_length("model_connections"."label") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "model_connection_id" text;--> statement-breakpoint
ALTER TABLE "model_connections" ADD CONSTRAINT "model_connections_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_connections_order_idx" ON "model_connections" USING btree ("server_id","provider","position");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_model_connection_fk" FOREIGN KEY ("server_id","model_connection_id") REFERENCES "public"."model_connections"("server_id","id") ON DELETE set null (model_connection_id) ON UPDATE no action;