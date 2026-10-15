CREATE TABLE "linear_outbox" (
	"attempts" integer DEFAULT 0 NOT NULL,
	"client_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"credential_id" text,
	"done_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"input" jsonb NOT NULL,
	"kind" text NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"server_id" text NOT NULL,
	"state" text NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "linear_outbox_id_shape" CHECK ("linear_outbox"."id" ~ '^lnx_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_outbox_kind" CHECK ("linear_outbox"."kind" in (
                'session_ack', 'session_activity', 'session_create', 'label_group_create',
                'label_create', 'label_rename', 'label_archive', 'issue_route', 'token_revoke'
            )),
	CONSTRAINT "linear_outbox_state" CHECK ("linear_outbox"."state" in ('queued', 'done', 'dead')),
	CONSTRAINT "linear_outbox_done" CHECK (("linear_outbox"."state" = 'queued') = ("linear_outbox"."done_at" is null)),
	CONSTRAINT "linear_outbox_nonnegative" CHECK ("linear_outbox"."attempts" >= 0),
	CONSTRAINT "linear_outbox_input_size" CHECK (octet_length("linear_outbox"."input"::text) <= 65536)
);
--> statement-breakpoint
ALTER TABLE "linear_agent_sessions" DROP CONSTRAINT "linear_agent_sessions_status";--> statement-breakpoint
ALTER TABLE "linear_webhook_deliveries" DROP CONSTRAINT "linear_webhook_deliveries_projection_size";--> statement-breakpoint
ALTER TABLE "linear_agent_sessions" ADD COLUMN "anchor_chat_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_outbox" ADD CONSTRAINT "linear_outbox_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_outbox" ADD CONSTRAINT "linear_outbox_workspace_fk" FOREIGN KEY ("server_id","workspace_id") REFERENCES "public"."linear_workspaces"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "linear_outbox_queue_idx" ON "linear_outbox" USING btree ("state","next_attempt_at");--> statement-breakpoint
ALTER TABLE "linear_agent_sessions" ADD CONSTRAINT "linear_agent_sessions_anchor_chat_fk" FOREIGN KEY ("server_id","anchor_chat_id") REFERENCES "public"."chats"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_webhook_deliveries" DROP COLUMN "projection";--> statement-breakpoint
ALTER TABLE "linear_agent_sessions" ADD CONSTRAINT "linear_agent_sessions_status" CHECK ("linear_agent_sessions"."status" in ('active', 'complete', 'stopped', 'handed_off', 'orphaned'));--> statement-breakpoint
ALTER TABLE "linear_webhook_deliveries" ADD COLUMN "body" jsonb;--> statement-breakpoint
ALTER TABLE "linear_webhook_deliveries" ADD COLUMN "deferred_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linear_webhook_deliveries" ADD CONSTRAINT "linear_webhook_deliveries_body" CHECK (("linear_webhook_deliveries"."body" is null or octet_length("linear_webhook_deliveries"."body"::text) <= 2097152)
                and ("linear_webhook_deliveries"."state" not in ('done', 'ignored') or "linear_webhook_deliveries"."body" is null));