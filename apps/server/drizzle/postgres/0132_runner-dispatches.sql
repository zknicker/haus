CREATE TABLE "agent_dispatches" (
	"accepted_at" timestamp with time zone NOT NULL,
	"agent_id" text NOT NULL,
	"dispatch_id" text NOT NULL,
	"finished_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"request_fingerprint" text NOT NULL,
	"response_body" jsonb,
	"response_status" integer,
	"route" text NOT NULL,
	"run_id" text NOT NULL,
	"server_id" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "agent_dispatches_id_shape" CHECK ("agent_dispatches"."id" ~ '^adp_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "agent_dispatches_state" CHECK ("agent_dispatches"."state" in ('accepted', 'finished', 'unknown')),
	CONSTRAINT "agent_dispatches_finished_shape" CHECK (("agent_dispatches"."state" = 'finished') = ("agent_dispatches"."response_status" is not null and "agent_dispatches"."finished_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "agent_runner_credentials" ALTER COLUMN "computer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dispatches" ADD CONSTRAINT "agent_dispatches_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_dispatches_agent_dispatch_key" ON "agent_dispatches" USING btree ("server_id","agent_id","dispatch_id");