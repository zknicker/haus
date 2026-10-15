CREATE TABLE "agent_execution_journal_records" (
	"agent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"record" jsonb NOT NULL,
	"run_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "agent_execution_journal_records_pkey" PRIMARY KEY("server_id","agent_id","run_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "agent_execution_journals" (
	"agent_id" text NOT NULL,
	"outline" jsonb,
	"outline_sequence" bigint,
	"run_id" text NOT NULL,
	"run_started_at" timestamp with time zone NOT NULL,
	"server_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_execution_journals_pkey" PRIMARY KEY("server_id","agent_id","run_id")
);
--> statement-breakpoint
ALTER TABLE "agent_execution_journal_records" ADD CONSTRAINT "agent_execution_journal_records_run_fk" FOREIGN KEY ("server_id","agent_id","run_id") REFERENCES "public"."agent_execution_journals"("server_id","agent_id","run_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_journals" ADD CONSTRAINT "agent_execution_journals_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_journals" ADD CONSTRAINT "agent_execution_journals_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_execution_journals_started_idx" ON "agent_execution_journals" USING btree ("run_started_at");