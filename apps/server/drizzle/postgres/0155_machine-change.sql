CREATE TABLE "agent_machine_changes" (
	"agent_id" text NOT NULL,
	"computer_id" text NOT NULL,
	"flush_id" text,
	"flush_sent_at" timestamp with time zone,
	"flushed_at" timestamp with time zone,
	"from_last_synced" boolean NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "agent_machine_changes_server_id_agent_id_pk" PRIMARY KEY("server_id","agent_id")
);
--> statement-breakpoint
ALTER TABLE "agent_invocations" DROP CONSTRAINT "agent_invocations_refusal";--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD COLUMN "placement_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "placement_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_pushes" ADD COLUMN "placement_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_machine_changes" ADD CONSTRAINT "agent_machine_changes_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_machine_changes" ADD CONSTRAINT "agent_machine_changes_computer_fk" FOREIGN KEY ("server_id","computer_id") REFERENCES "public"."computers"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_machine_changes" ADD CONSTRAINT "agent_machine_changes_requester_fk" FOREIGN KEY ("server_id","requested_by_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_refusal" CHECK ("agent_invocations"."refusal" is null or ("agent_invocations"."refusal" in ('not-found', 'no-access', 'moved', 'off', 'not-listed', 'not-mac', 'offline', 'not-ready', 'locked', 'no-session', 'switched-out') and "agent_invocations"."state" = 'finished'));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_placement_generation" CHECK ("agents"."placement_generation" >= 0);