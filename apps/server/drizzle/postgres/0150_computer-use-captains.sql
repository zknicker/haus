CREATE TABLE "computer_use_agents" (
	"agent_id" text NOT NULL,
	"computer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "computer_use_agents_computer_id_agent_id_pk" PRIMARY KEY("computer_id","agent_id")
);
--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD COLUMN "refusal" text;--> statement-breakpoint
ALTER TABLE "computers" ADD COLUMN "computer_use_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "computers" ADD COLUMN "computer_use_scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "computer_use_agents" ADD CONSTRAINT "computer_use_agents_computer_fk" FOREIGN KEY ("server_id","computer_id") REFERENCES "public"."computers"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_use_agents" ADD CONSTRAINT "computer_use_agents_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_invocations_refusal_idx" ON "agent_invocations" USING btree ("agent_id","computer_id","requested_at") WHERE "agent_invocations"."refusal" is not null;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_refusal" CHECK ("agent_invocations"."refusal" is null or ("agent_invocations"."refusal" in ('off', 'not-listed', 'not-mac', 'offline', 'not-ready', 'locked', 'no-session', 'switched-out') and "agent_invocations"."state" = 'finished'));--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_computer_use_scope" CHECK ("computers"."computer_use_scope" in ('all', 'named'));--> statement-breakpoint
UPDATE "computers" SET "computer_use_changed_at" = now();--> statement-breakpoint
CREATE FUNCTION "computer_use_agents_drop_moved"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	DELETE FROM "computer_use_agents" WHERE "server_id" = OLD."server_id" AND "agent_id" = OLD."id";
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "agents_computer_use_moved" AFTER UPDATE OF "computer_id" ON "agents" FOR EACH ROW WHEN (OLD."computer_id" IS DISTINCT FROM NEW."computer_id") EXECUTE FUNCTION "computer_use_agents_drop_moved"();
