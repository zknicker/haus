CREATE TABLE "cloud_agent_callbacks" (
	"run_id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"session_id" text,
	CONSTRAINT "cloud_agent_callbacks_token_key" UNIQUE("token_hash"),
	CONSTRAINT "cloud_agent_callbacks_token_shape" CHECK ("cloud_agent_callbacks"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "cloud_agent_input" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"run_id" text NOT NULL,
	"session_id" text NOT NULL,
	"prompt_id" text NOT NULL,
	"tool_use_id" text NOT NULL,
	"questions" jsonb NOT NULL,
	"answer" jsonb,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resumed_prompt_id" text,
	"resumed_tool_use_id" text,
	CONSTRAINT "cloud_agent_input_native_key" UNIQUE("run_id","session_id","prompt_id","tool_use_id"),
	CONSTRAINT "cloud_agent_input_state" CHECK ("cloud_agent_input"."state" in ('pending','answered','resolved','cancelled')),
	CONSTRAINT "cloud_agent_input_answer_shape" CHECK (("cloud_agent_input"."state" in ('answered','resolved')) = ("cloud_agent_input"."answer" is not null) or "cloud_agent_input"."state" = 'cancelled'),
	CONSTRAINT "cloud_agent_input_receipt_shape" CHECK (("cloud_agent_input"."state" = 'resolved') = ("cloud_agent_input"."resumed_prompt_id" is not null and "cloud_agent_input"."resumed_tool_use_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "cloud_agent_prompts" (
	"server_id" text NOT NULL,
	"run_id" text NOT NULL,
	"prompt_id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_connections" DROP CONSTRAINT "mcp_connections_preset";--> statement-breakpoint
ALTER TABLE "cloud_agent_callbacks" ADD CONSTRAINT "cloud_agent_callbacks_run_fk" FOREIGN KEY ("server_id","run_id") REFERENCES "public"."cloud_agent_runs"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_agent_input" ADD CONSTRAINT "cloud_agent_input_run_fk" FOREIGN KEY ("server_id","run_id") REFERENCES "public"."cloud_agent_runs"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_agent_prompts" ADD CONSTRAINT "cloud_agent_prompts_run_fk" FOREIGN KEY ("server_id","run_id") REFERENCES "public"."cloud_agent_runs"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_preset" CHECK ("mcp_connections"."preset" is null or "mcp_connections"."preset" in ('github', 'google-calendar', 'merchbase', 'merchbase-atlas', 'merchbase-fulfillment', 'rankwrangler', 'x', 'coingecko', 'skool', 'cloudflare', 'handmade', 'tmterminal'));