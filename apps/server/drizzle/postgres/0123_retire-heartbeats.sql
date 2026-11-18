-- ADR 0052 decision 1: heartbeats retire completely. No daytime runs, no nightly
-- dream, no heartbeat reports, leads, checks, or dream records.
-- Deferred foreign-key checks would otherwise leave trigger events pending
-- on tables this migration then alters.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
DROP TABLE "agent_dream_summaries" CASCADE;--> statement-breakpoint
DROP TABLE "agent_dreams" CASCADE;--> statement-breakpoint
DROP TABLE "agent_heartbeat_checks" CASCADE;--> statement-breakpoint
DROP TABLE "agent_leads" CASCADE;--> statement-breakpoint
-- A dream, heartbeat, or heartbeat report run still in flight ends here: its
-- credential is revoked and the Agent's run slot clears, so the next dispatch
-- starts ordinary work instead of resending a run nothing can frame.
UPDATE "agent_runner_credentials"
SET "revoked_at" = now()
WHERE "revoked_at" IS NULL
    AND "run_id" IN (
        SELECT "run_id" FROM "agent_run_triggers"
        WHERE "source" IN ('dream', 'heartbeat', 'heartbeat_report')
    );--> statement-breakpoint
UPDATE "agent_delivery"
SET
    "accepted_at" = NULL,
    "active_run_chat_id" = NULL,
    "active_run_computer_id" = NULL,
    "active_run_id" = NULL,
    "active_run_model_id" = NULL,
    "active_run_reasoning_effort" = NULL,
    "active_run_runtime_id" = NULL,
    "dispatched_at" = NULL,
    "updated_at" = now()
WHERE "active_run_id" IN (
    SELECT "run_id" FROM "agent_run_triggers"
    WHERE "source" IN ('dream', 'heartbeat', 'heartbeat_report')
);--> statement-breakpoint
-- Their inbox rows and recorded triggers go with them; a settled turn they woke
-- reads as having no recorded trigger.
DELETE FROM "agent_inbox" WHERE "source" IN ('dream', 'heartbeat', 'heartbeat_report');--> statement-breakpoint
DELETE FROM "agent_run_triggers" WHERE "source" IN ('dream', 'heartbeat', 'heartbeat_report');--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_chat";--> statement-breakpoint
ALTER TABLE "agent_run_triggers" DROP CONSTRAINT "agent_run_triggers_chat";--> statement-breakpoint
-- Only heartbeats waited out an Agent's background tasks.
ALTER TABLE "agents" DROP COLUMN "effective_background_tasks";--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_chat" CHECK (("agent_inbox"."chat_id" is null) = ("agent_inbox"."source" in ('subagent', 'task_assignment')));--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat" CHECK (("agent_run_triggers"."chat_id" is null) = ("agent_run_triggers"."source" in ('subagent', 'task_assignment')));
