-- Deferred foreign-key checks would otherwise leave trigger events pending
-- on tables this migration then alters.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
DROP TABLE "linear_identities" CASCADE;--> statement-breakpoint
DROP TABLE "linear_oauth_attempts" CASCADE;--> statement-breakpoint
DROP TABLE "linear_workspaces" CASCADE;--> statement-breakpoint
DROP TABLE "linear_agent_labels" CASCADE;--> statement-breakpoint
DROP TABLE "linear_label_groups" CASCADE;--> statement-breakpoint
DROP TABLE "linear_trigger_configs" CASCADE;--> statement-breakpoint
DROP TABLE "linear_writes" CASCADE;--> statement-breakpoint
DROP TABLE "linear_credentials" CASCADE;--> statement-breakpoint
DROP TABLE "linear_identity_secrets" CASCADE;--> statement-breakpoint
DROP TABLE "linear_team_access" CASCADE;--> statement-breakpoint
DROP TABLE "linear_agent_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "linear_webhook_deliveries" CASCADE;--> statement-breakpoint
DROP TABLE "linear_outbox" CASCADE;--> statement-breakpoint
-- The built-in Linear connection is gone. Its Triggers, connections, and
-- session wakes cannot run without it; fires, message causes, grants, and
-- secrets cascade with their parents.
DELETE FROM "agent_inbox" WHERE "source" in ('linear_session', 'linear_session_automated');--> statement-breakpoint
DELETE FROM "triggers" WHERE "kind" = 'linear';--> statement-breakpoint
DELETE FROM "mcp_connections" WHERE "preset" = 'linear';--> statement-breakpoint
ALTER TABLE "mcp_connections" DROP CONSTRAINT "mcp_connections_preset";--> statement-breakpoint
ALTER TABLE "triggers" DROP CONSTRAINT "triggers_kind";--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_preset" CHECK ("mcp_connections"."preset" is null or "mcp_connections"."preset" in ('github', 'google-calendar', 'merchbase', 'merchbase-atlas', 'merchbase-fulfillment', 'rankwrangler', 'x', 'coingecko', 'skool', 'cloudflare', 'handmade', 'tmterminal', 'factory', 'kittl'));--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_kind" CHECK ("triggers"."kind" in ('webhook', 'github'));
