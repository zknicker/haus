ALTER TABLE "computers" ADD COLUMN "inventory_invalid_at" timestamp with time zone;--> statement-breakpoint
UPDATE "computers" SET "inventory_invalid_at" = "server_onboarding"."updated_at" FROM "server_onboarding" WHERE "server_onboarding"."computer_id" = "computers"."id" AND "server_onboarding"."failure_code" = 'inventory-invalid';--> statement-breakpoint
UPDATE "agent_inbox" SET "state" = 'seen', "seen_at" = now(), "undelivered_reason" = 'Haus no longer runs Server onboarding.' WHERE "source" = 'onboarding' AND "state" <> 'seen';--> statement-breakpoint
UPDATE "chats" SET "deleted_at" = NULL, "deleted_by_user_id" = NULL WHERE "deleted_at" IS NOT NULL AND ("server_id", "id") IN (SELECT "server_id", "channel_id" FROM "server_onboarding");--> statement-breakpoint
ALTER TABLE "server_onboarding" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "server_onboarding" CASCADE;--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_factory_kind";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_handle_grammar";--> statement-breakpoint
ALTER TABLE "server_memberships" DROP CONSTRAINT "server_memberships_handle_grammar";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "factory_applied_at";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "factory_kind";--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_handle_grammar" CHECK ("agents"."handle" ~ '^[a-z0-9][a-z0-9-]{1,30}$' and lower("agents"."handle") not in ('agent', 'agents', 'all', 'busy', 'everyone', 'haus', 'here', 'human', 'humans', 'idle', 'system'));--> statement-breakpoint
ALTER TABLE "server_memberships" ADD CONSTRAINT "server_memberships_handle_grammar" CHECK ("server_memberships"."handle" is null or ("server_memberships"."handle" ~ '^[a-z0-9][a-z0-9-]{1,30}$' and lower("server_memberships"."handle") not in ('agent', 'agents', 'all', 'busy', 'everyone', 'haus', 'here', 'human', 'humans', 'idle', 'system')));