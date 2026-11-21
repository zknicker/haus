CREATE TABLE "computer_use_requests" (
	"agent_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"command" text NOT NULL,
	"computer_id" text NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" text,
	"detail" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" text NOT NULL,
	"server_id" text NOT NULL,
	"standing" boolean DEFAULT false NOT NULL,
	"state" text NOT NULL,
	"tool_call_id" text NOT NULL,
	CONSTRAINT "computer_use_requests_state" CHECK ("computer_use_requests"."state" in ('requested', 'allowed', 'denied')),
	CONSTRAINT "computer_use_requests_decided_shape" CHECK (("computer_use_requests"."state" = 'requested') = ("computer_use_requests"."decided_at" is null)),
	CONSTRAINT "computer_use_requests_standing_shape" CHECK (not "computer_use_requests"."standing" or "computer_use_requests"."state" = 'allowed'),
	CONSTRAINT "computer_use_requests_detail_length" CHECK (char_length("computer_use_requests"."detail") <= 200)
);
--> statement-breakpoint
ALTER TABLE "computers" ADD COLUMN "computer_use_access" text DEFAULT 'ask' NOT NULL;--> statement-breakpoint
ALTER TABLE "computer_use_requests" ADD CONSTRAINT "computer_use_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_use_requests" ADD CONSTRAINT "computer_use_requests_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_use_requests" ADD CONSTRAINT "computer_use_requests_chat_fk" FOREIGN KEY ("server_id","chat_id") REFERENCES "public"."chats"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_use_requests" ADD CONSTRAINT "computer_use_requests_computer_fk" FOREIGN KEY ("server_id","computer_id") REFERENCES "public"."computers"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_use_requests" ADD CONSTRAINT "computer_use_requests_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "computer_use_requests_open_key" ON "computer_use_requests" USING btree ("server_id","chat_id","computer_id") WHERE "computer_use_requests"."state" = 'requested';--> statement-breakpoint
CREATE INDEX "computer_use_requests_chat_idx" ON "computer_use_requests" USING btree ("server_id","chat_id","computer_id","state");--> statement-breakpoint
CREATE INDEX "computer_use_requests_requested_idx" ON "computer_use_requests" USING btree ("requested_at");--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_computer_use_access" CHECK ("computers"."computer_use_access" in ('ask', 'always'));