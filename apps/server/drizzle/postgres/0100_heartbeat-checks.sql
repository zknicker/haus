CREATE TABLE "agent_heartbeat_checks" (
	"agent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"local_date" text NOT NULL,
	"outcome" text NOT NULL,
	"run_id" text,
	"server_id" text NOT NULL,
	"skip_reason" text,
	"slot" text NOT NULL,
	CONSTRAINT "agent_heartbeat_checks_kind" CHECK ("agent_heartbeat_checks"."kind" in ('daytime', 'nightly')),
	CONSTRAINT "agent_heartbeat_checks_outcome" CHECK ("agent_heartbeat_checks"."outcome" in ('queued', 'skipped', 'paused', 'yielded')),
	CONSTRAINT "agent_heartbeat_checks_skip_reason" CHECK (("agent_heartbeat_checks"."outcome" in ('skipped', 'paused')) = ("agent_heartbeat_checks"."skip_reason" is not null)
                and ("agent_heartbeat_checks"."outcome" <> 'paused' or "agent_heartbeat_checks"."skip_reason" = 'plan-limit')
                and ("agent_heartbeat_checks"."skip_reason" is null or "agent_heartbeat_checks"."skip_reason" in ('busy', 'stopped', 'plan-limit', 'no-activity', 'not-configured'))),
	CONSTRAINT "agent_heartbeat_checks_run" CHECK (("agent_heartbeat_checks"."outcome" = 'yielded') = ("agent_heartbeat_checks"."run_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "agent_heartbeat_checks" ADD CONSTRAINT "agent_heartbeat_checks_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_heartbeat_checks" ADD CONSTRAINT "agent_heartbeat_checks_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_heartbeat_checks_agent_created_idx" ON "agent_heartbeat_checks" USING btree ("server_id","agent_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_heartbeat_checks_slot_key" ON "agent_heartbeat_checks" USING btree ("server_id","agent_id","kind","local_date","slot","outcome");