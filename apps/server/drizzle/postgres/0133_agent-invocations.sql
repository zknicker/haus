CREATE TABLE "agent_invocation_payloads" (
	"attachment_id" text PRIMARY KEY NOT NULL,
	"invocation_id" text NOT NULL,
	"server_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_invocations" (
	"accepted_at" timestamp with time zone,
	"agent_id" text NOT NULL,
	"computer_id" text,
	"exit_code" integer,
	"finished_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"late_exit_code" integer,
	"late_outcome" text,
	"late_result_at" timestamp with time zone,
	"operation_kind" text NOT NULL,
	"outcome" text,
	"requested_at" timestamp with time zone NOT NULL,
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"server_id" text NOT NULL,
	"state" text NOT NULL,
	"timeout_ms" integer NOT NULL,
	"tool_call_id" text NOT NULL,
	CONSTRAINT "agent_invocations_id_shape" CHECK ("agent_invocations"."id" ~ '^inv_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "agent_invocations_state" CHECK ("agent_invocations"."state" in ('sent', 'accepted', 'finished', 'unknown')),
	CONSTRAINT "agent_invocations_settled_shape" CHECK (("agent_invocations"."state" in ('finished', 'unknown')) = ("agent_invocations"."outcome" is not null and "agent_invocations"."finished_at" is not null)),
	CONSTRAINT "agent_invocations_unknown_shape" CHECK (("agent_invocations"."state" = 'unknown') = (coalesce("agent_invocations"."outcome", '') = 'unknown')),
	CONSTRAINT "agent_invocations_late_shape" CHECK (("agent_invocations"."late_outcome" is null) = ("agent_invocations"."late_result_at" is null) and ("agent_invocations"."late_outcome" is null or "agent_invocations"."state" = 'unknown')),
	CONSTRAINT "agent_invocations_sent_shape" CHECK ("agent_invocations"."computer_id" is not null or "agent_invocations"."outcome" = 'offline')
);
--> statement-breakpoint
ALTER TABLE "agent_invocation_payloads" ADD CONSTRAINT "agent_invocation_payloads_invocation_id_agent_invocations_id_fk" FOREIGN KEY ("invocation_id") REFERENCES "public"."agent_invocations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocation_payloads" ADD CONSTRAINT "agent_invocation_payloads_attachment_fk" FOREIGN KEY ("server_id","attachment_id") REFERENCES "public"."attachments"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_invocation_payloads_invocation_idx" ON "agent_invocation_payloads" USING btree ("invocation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_invocations_dispatch_key" ON "agent_invocations" USING btree ("server_id","agent_id","run_id","tool_call_id","seq");--> statement-breakpoint
CREATE INDEX "agent_invocations_requested_idx" ON "agent_invocations" USING btree ("requested_at");