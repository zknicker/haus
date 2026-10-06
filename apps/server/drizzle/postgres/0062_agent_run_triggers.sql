CREATE TABLE "agent_run_triggers" (
	"agent_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" text NOT NULL,
	"server_id" text NOT NULL,
	"source" text NOT NULL,
	"work_id" text NOT NULL,
	CONSTRAINT "agent_run_triggers_server_id_agent_id_run_id_pk" PRIMARY KEY("server_id","agent_id","run_id")
);
--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat_fk" FOREIGN KEY ("server_id","chat_id") REFERENCES "public"."chats"("server_id","id") ON DELETE cascade ON UPDATE no action;