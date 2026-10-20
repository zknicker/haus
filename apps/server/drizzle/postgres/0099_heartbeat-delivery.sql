CREATE TABLE "agent_dream_summaries" (
	"agent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"summary" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_leads" (
	"agent_id" text NOT NULL,
	"anchor_chat_id" text,
	"anchor_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"done_at" timestamp with time zone,
	"finding" text,
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"topic" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_chat";--> statement-breakpoint
ALTER TABLE "agent_run_triggers" DROP CONSTRAINT "agent_run_triggers_chat";--> statement-breakpoint
ALTER TABLE "agent_dream_summaries" ADD CONSTRAINT "agent_dream_summaries_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_dream_summaries" ADD CONSTRAINT "agent_dream_summaries_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_leads" ADD CONSTRAINT "agent_leads_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_leads" ADD CONSTRAINT "agent_leads_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_leads_created_idx" ON "agent_leads" USING btree ("server_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_leads_anchor_idx" ON "agent_leads" USING btree ("server_id","anchor_message_id");--> statement-breakpoint
CREATE INDEX "chat_messages_author_agent_idx" ON "chat_messages" USING btree ("server_id","author_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "reminders_owner_created_idx" ON "reminders" USING btree ("server_id","owner_agent_id","created_at");--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_chat" CHECK (("agent_inbox"."chat_id" is null) = ("agent_inbox"."source" in ('dream', 'heartbeat', 'heartbeat_report')));--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat" CHECK (("agent_run_triggers"."chat_id" is null) = ("agent_run_triggers"."source" in ('dream', 'heartbeat', 'heartbeat_report')));