CREATE TABLE "cloud_agent_bootstrap" (
	"computer_id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	CONSTRAINT "cloud_agent_bootstrap_token_key" UNIQUE("token_hash"),
	CONSTRAINT "cloud_agent_bootstrap_token_shape" CHECK ("cloud_agent_bootstrap"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "cloud_agent_continuations" (
	"request_id" text PRIMARY KEY NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempted_at" timestamp with time zone,
	CONSTRAINT "cloud_agent_continuations_state" CHECK ("cloud_agent_continuations"."state" in ('queued','sending','accepted'))
);
--> statement-breakpoint
ALTER TABLE "cloud_agent_bootstrap" ADD CONSTRAINT "cloud_agent_bootstrap_computer_id_computers_id_fk" FOREIGN KEY ("computer_id") REFERENCES "public"."computers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_agent_continuations" ADD CONSTRAINT "cloud_agent_continuations_input_fk" FOREIGN KEY ("request_id") REFERENCES "public"."cloud_agent_input"("id") ON DELETE cascade ON UPDATE no action;