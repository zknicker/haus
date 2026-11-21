CREATE TABLE "agent_context_snapshots" (
	"agent_id" text NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" text NOT NULL,
	"server_id" text NOT NULL,
	"session_generation" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "agent_context_snapshots_server_id_agent_id_pk" PRIMARY KEY("server_id","agent_id"),
	CONSTRAINT "agent_context_snapshots_generation" CHECK ("agent_context_snapshots"."session_generation" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_context_snapshots" ADD CONSTRAINT "agent_context_snapshots_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;