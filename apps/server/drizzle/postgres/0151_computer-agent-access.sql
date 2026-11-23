CREATE TABLE "computer_agent_access" (
	"agent_id" text NOT NULL,
	"computer_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "computer_agent_access_computer_id_agent_id_pk" PRIMARY KEY("computer_id","agent_id")
);
--> statement-breakpoint
ALTER TABLE "agent_invocations" DROP CONSTRAINT "agent_invocations_refusal";--> statement-breakpoint
ALTER TABLE "agent_invocations" DROP CONSTRAINT "agent_invocations_sent_shape";--> statement-breakpoint
ALTER TABLE "computer_agent_access" ADD CONSTRAINT "computer_agent_access_computer_fk" FOREIGN KEY ("server_id","computer_id") REFERENCES "public"."computers"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_agent_access" ADD CONSTRAINT "computer_agent_access_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_agent_access" ADD CONSTRAINT "computer_agent_access_granter_fk" FOREIGN KEY ("server_id","granted_by_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_refusal" CHECK ("agent_invocations"."refusal" is null or ("agent_invocations"."refusal" in ('not-found', 'no-access', 'off', 'not-listed', 'not-mac', 'offline', 'not-ready', 'locked', 'no-session', 'switched-out') and "agent_invocations"."state" = 'finished'));--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_sent_shape" CHECK ("agent_invocations"."computer_id" is not null or "agent_invocations"."outcome" = 'offline' or coalesce("agent_invocations"."refusal", '') = 'not-found');--> statement-breakpoint
CREATE OR REPLACE FUNCTION "computer_use_agents_drop_moved"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	DELETE FROM "computer_use_agents" WHERE "server_id" = OLD."server_id" AND "agent_id" = OLD."id" AND "computer_id" = OLD."computer_id";
	RETURN NEW;
END;
$$;
