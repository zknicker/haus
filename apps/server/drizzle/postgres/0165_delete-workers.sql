-- ADR 0062 step 7: Workers and the Cursor and Claude cloud hand-off are deleted. Rows that only a
-- Worker could read go with them: Worker report and stall inbox items, and Worker Drive pushes (their
-- outcomes cascade). Rows that outlive their Worker keep their meaning without it: a Worker's Drive
-- conflict item names its Agent as the writer, a file a Worker deleted names its Agent as the
-- deleter, Worker report and follow-up messages become text with their trailing Worker link removed
-- (the transcript already hid it), and stored Computer inventories drop the cloud and Worker runtime
-- readings. A Project's Computer default becomes its default Machine for Tasks; a cloud default
-- has no Computer and clears. SET CONSTRAINTS ALL IMMEDIATE flushes the deletes' pending trigger
-- events before the ALTERs.
DELETE FROM "agent_inbox" WHERE "source" IN ('worker_report', 'worker_stall');--> statement-breakpoint
UPDATE "agent_inbox" SET "content" = jsonb_set("content"::jsonb, '{writer}', jsonb_build_object('agentId', "content"::jsonb #>> '{writer,agentId}', 'type', 'agent'))::text WHERE "source" = 'drive_conflict' AND "content"::jsonb #>> '{writer,type}' = 'worker';--> statement-breakpoint
UPDATE "artifacts" SET "deleted_by" = 'agent:' || "workers"."agent_id" FROM "workers" WHERE "workers"."server_id" = "artifacts"."server_id" AND "artifacts"."deleted_by" = 'worker:' || "workers"."id";--> statement-breakpoint
DELETE FROM "drive_pushes" WHERE "worker_id" IS NOT NULL;--> statement-breakpoint
UPDATE "chat_messages" SET "body_kind" = CASE WHEN "body_kind" IN ('worker-report', 'worker-follow-up') THEN 'text' ELSE "body_kind" END, "content" = regexp_replace("content", E'\n\n\\[[^]]*\\]\\(worker://[^)]*\\)$', '') WHERE "body_kind" IN ('worker-report', 'worker-follow-up') OR "content" ~ E'\n\n\\[[^]]*\\]\\(worker://[^)]*\\)$';--> statement-breakpoint
UPDATE "computers" SET "reported_inventory" = "reported_inventory" - 'cloudAgentProviders' - 'workerRuntimes' WHERE "reported_inventory" IS NOT NULL;--> statement-breakpoint
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_worker_shape";--> statement-breakpoint
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_deleted_by_shape";--> statement-breakpoint
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_body_kind";--> statement-breakpoint
ALTER TABLE "computers" DROP CONSTRAINT "computers_worker_limit";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_default_worker_place";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_default_worker_computer";--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_worker_turn_fk";--> statement-breakpoint
ALTER TABLE "artifact_revisions" DROP CONSTRAINT "artifact_revisions_author_worker_fk";--> statement-breakpoint
ALTER TABLE "drive_pushes" DROP CONSTRAINT "drive_pushes_worker_fk";--> statement-breakpoint
DROP INDEX "drive_pushes_worker_open";--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP COLUMN "worker_turn_id";--> statement-breakpoint
ALTER TABLE "artifact_revisions" DROP COLUMN "author_worker_id";--> statement-breakpoint
ALTER TABLE "computers" DROP COLUMN "worker_limit";--> statement-breakpoint
ALTER TABLE "computers" DROP COLUMN "workers_enabled";--> statement-breakpoint
ALTER TABLE "drive_pushes" DROP COLUMN "worker_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "default_worker_place";--> statement-breakpoint
ALTER TABLE "projects" RENAME COLUMN "default_worker_computer_id" TO "default_task_computer_id";--> statement-breakpoint
ALTER TABLE "projects" RENAME CONSTRAINT "projects_default_worker_computer_fk" TO "projects_default_task_computer_fk";--> statement-breakpoint
DROP TABLE "cloud_agent_model_settings" CASCADE;--> statement-breakpoint
DROP TABLE "worker_history_links" CASCADE;--> statement-breakpoint
DROP TABLE "worker_place_limits" CASCADE;--> statement-breakpoint
DROP TABLE "worker_turn_credentials" CASCADE;--> statement-breakpoint
DROP TABLE "worker_turns" CASCADE;--> statement-breakpoint
DROP TABLE "workers" CASCADE;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_deleted_by_shape" CHECK ("artifacts"."deleted_by" is null or "artifacts"."deleted_by" ~ '^(agent|user):.+$');--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_body_kind" CHECK ("chat_messages"."body_kind" in ('text', 'agent-created'));
