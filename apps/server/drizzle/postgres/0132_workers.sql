-- ADR 0056: cloud agents become Workers (specs/workers.md "Migration from cloud agents").
-- Every step converges, so running this file again changes nothing.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
ALTER TABLE IF EXISTS "cloud_agent_work" RENAME TO "workers";--> statement-breakpoint
ALTER TABLE IF EXISTS "cloud_agent_runs" RENAME TO "worker_turns";--> statement-breakpoint
ALTER TABLE IF EXISTS "cloud_agent_work_links" RENAME TO "worker_history_links";--> statement-breakpoint
ALTER TABLE IF EXISTS "cloud_agent_pull_requests" RENAME TO "pull_request_readings";--> statement-breakpoint
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('workers', 'computer_id', 'carrier_computer_id'),
        ('workers', 'provider', 'place'),
        ('workers', 'chat_id', 'origin_chat_id'),
        ('worker_turns', 'work_id', 'worker_id'),
        ('worker_turns', 'report', 'provider_result'),
        ('worker_turns', 'cancel_requested_at', 'stop_requested_at'),
        ('worker_turns', 'cancel_requested_by_agent_id', 'stop_requested_by_agent_id'),
        ('worker_turns', 'cancel_requested_by_user_id', 'stop_requested_by_user_id'),
        ('worker_history_links', 'work_id', 'worker_id'),
        ('agent_inbox', 'cloud_agent_run_id', 'worker_turn_id')
    ) AS v(t, old, new) LOOP
        IF EXISTS (
            SELECT 1 FROM pg_attribute
            WHERE attrelid = to_regclass(r.t) AND attname = r.old AND NOT attisdropped
        ) THEN
            EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', r.t, r.old, r.new);
        END IF;
    END LOOP;
    FOR r IN SELECT * FROM (VALUES
        ('workers', 'cloud_agent_work_pkey', 'workers_pkey'),
        ('workers', 'cloud_agent_work_server_id_key', 'workers_server_id_key'),
        ('workers', 'cloud_agent_work_task_fk', 'workers_task_fk'),
        ('workers', 'cloud_agent_work_agent_fk', 'workers_agent_fk'),
        ('workers', 'cloud_agent_work_status', 'workers_status'),
        ('workers', 'cloud_agent_work_title_length', 'workers_title_length'),
        ('workers', 'cloud_agent_work_repository_shape', 'workers_repository_shape'),
        ('workers', 'cloud_agent_work_activity_shape', 'workers_activity_shape'),
        ('workers', 'cloud_agent_work_terminal_shape', 'workers_terminal_shape'),
        ('worker_turns', 'cloud_agent_runs_pkey', 'worker_turns_pkey'),
        ('worker_turns', 'cloud_agent_runs_server_id_key', 'worker_turns_server_id_key'),
        ('worker_turns', 'cloud_agent_runs_work_fk', 'worker_turns_worker_fk'),
        ('worker_turns', 'cloud_agent_runs_cancel_agent_fk', 'worker_turns_stop_agent_fk'),
        ('worker_turns', 'cloud_agent_runs_cancel_membership_fk', 'worker_turns_stop_membership_fk'),
        ('worker_turns', 'cloud_agent_runs_status', 'worker_turns_status'),
        ('worker_turns', 'cloud_agent_runs_error_shape', 'worker_turns_error_shape'),
        ('worker_turns', 'cloud_agent_runs_stall_shape', 'worker_turns_stall_shape'),
        ('worker_turns', 'cloud_agent_runs_cancel_shape', 'worker_turns_stop_shape'),
        ('worker_turns', 'cloud_agent_runs_model_shape', 'worker_turns_model_shape'),
        ('worker_turns', 'cloud_agent_runs_model_params_shape', 'worker_turns_model_params_shape'),
        ('worker_turns', 'cloud_agent_runs_terminal_shape', 'worker_turns_terminal_shape'),
        ('worker_turns', 'cloud_agent_runs_report_shape', 'worker_turns_provider_result_shape'),
        ('worker_history_links', 'cloud_agent_work_links_pkey', 'worker_history_links_pkey'),
        ('worker_history_links', 'cloud_agent_work_links_work_fk', 'worker_history_links_worker_fk'),
        ('worker_history_links', 'cloud_agent_work_links_message_fk', 'worker_history_links_message_fk'),
        ('worker_history_links', 'cloud_agent_work_links_ordinal', 'worker_history_links_ordinal'),
        ('pull_request_readings', 'cloud_agent_pull_requests_pkey', 'pull_request_readings_pkey'),
        ('pull_request_readings', 'cloud_agent_pull_requests_server_fk', 'pull_request_readings_server_fk'),
        ('pull_request_readings', 'cloud_agent_pull_requests_checks_check', 'pull_request_readings_checks_check'),
        ('pull_request_readings', 'cloud_agent_pull_requests_review_check', 'pull_request_readings_review_check'),
        ('pull_request_readings', 'cloud_agent_pull_requests_source_check', 'pull_request_readings_source_check'),
        ('pull_request_readings', 'cloud_agent_pull_requests_state_check', 'pull_request_readings_state_check'),
        ('agent_inbox', 'agent_inbox_cloud_agent_run_fk', 'agent_inbox_worker_turn_fk')
    ) AS v(t, old, new) LOOP
        IF EXISTS (
            SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass(r.t) AND conname = r.old
        ) THEN
            EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', r.t, r.old, r.new);
        END IF;
    END LOOP;
END $$;--> statement-breakpoint
ALTER INDEX IF EXISTS "cloud_agent_work_task_idx" RENAME TO "workers_task_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "cloud_agent_work_launch_message_idx" RENAME TO "workers_launch_message_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "cloud_agent_work_active_idx" RENAME TO "workers_active_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "cloud_agent_work_computer_active_idx" RENAME TO "workers_carrier_active_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "cloud_agent_runs_work_idx" RENAME TO "worker_turns_worker_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "cloud_agent_work_links_work_idx" RENAME TO "worker_history_links_worker_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "cloud_agent_work_links_chat_idx" RENAME TO "worker_history_links_chat_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "cloud_agent_pull_requests_head_idx" RENAME TO "pull_request_readings_head_idx";--> statement-breakpoint
ALTER INDEX IF EXISTS "cloud_agent_pull_requests_refresh_idx" RENAME TO "pull_request_readings_refresh_idx";--> statement-breakpoint
-- New Workers carry no history pointers and accept new id prefixes beside the migrated ones.
ALTER TABLE "workers" ALTER COLUMN "origin_chat_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workers" ALTER COLUMN "launch_message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "start_nonce" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "closing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "cloud_agent_work_id_shape";--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_id_shape";--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_id_shape" CHECK ("workers"."id" ~ '^(caw|wkr)_[A-Za-z0-9_-]{16}$');--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "cloud_agent_work_provider";--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_place";--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_place" CHECK ("workers"."place" in ('cursor', 'claude'));--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_start_nonce_key";--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_start_nonce_key" UNIQUE("server_id","agent_id","start_nonce");--> statement-breakpoint
-- Work from before Tasks becomes closed, read-only history.
UPDATE "workers" SET "closed_at" = coalesce("terminal_at", "updated_at")
WHERE "task_id" IS NULL AND "closed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_task_or_closed";--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_task_or_closed" CHECK ("workers"."task_id" is not null or "workers"."closed_at" is not null);--> statement-breakpoint
ALTER TABLE "worker_turns" ADD COLUMN IF NOT EXISTS "input" jsonb;--> statement-breakpoint
ALTER TABLE "worker_turns" ADD COLUMN IF NOT EXISTS "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "worker_turns" ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "worker_turns" ADD COLUMN IF NOT EXISTS "outcome" jsonb;--> statement-breakpoint
ALTER TABLE "worker_turns" DROP CONSTRAINT IF EXISTS "cloud_agent_runs_id_shape";--> statement-breakpoint
ALTER TABLE "worker_turns" DROP CONSTRAINT IF EXISTS "worker_turns_id_shape";--> statement-breakpoint
ALTER TABLE "worker_turns" ADD CONSTRAINT "worker_turns_id_shape" CHECK ("worker_turns"."id" ~ '^(car|wkt)_[A-Za-z0-9_-]{16}$');--> statement-breakpoint
ALTER TABLE "worker_turns" DROP CONSTRAINT IF EXISTS "worker_turns_input_shape";--> statement-breakpoint
ALTER TABLE "worker_turns" ADD CONSTRAINT "worker_turns_input_shape" CHECK ("worker_turns"."input" is null or jsonb_typeof("worker_turns"."input") = 'array');--> statement-breakpoint
-- A settled Run's input is spent; an unsettled one may still sit on its Computer, and the
-- Computer's follow-up drain fills it. A turn the provider already holds was dispatched.
UPDATE "worker_turns" SET "input" = '[]'::jsonb
WHERE "input" IS NULL
    AND "status" IN ('pending_input', 'completed', 'failed', 'cancelled', 'expired');--> statement-breakpoint
UPDATE "worker_turns" SET "dispatched_at" = "created_at", "acknowledged_at" = "created_at"
WHERE "dispatched_at" IS NULL
    AND ("status" <> 'queued' OR "provider_run_id" IS NOT NULL);--> statement-breakpoint
-- A settled Run's summary becomes a provider report. It posted no Message.
UPDATE "worker_turns" SET "outcome" = CASE
    WHEN "status" = 'cancelled' THEN '{"kind":"stopped"}'::jsonb
    WHEN "status" = 'expired' THEN jsonb_build_object(
        'kind', 'failed', 'reason', 'provider-expired', 'detail', "error_code")
    WHEN "status" = 'completed' AND coalesce("summary", '') = '' THEN jsonb_build_object(
        'kind', 'failed', 'reason', 'no-report', 'detail', "error_code")
    WHEN "status" = 'failed' AND coalesce("summary", '') = '' THEN jsonb_build_object(
        'kind', 'failed', 'reason', 'provider-error', 'detail', "error_code")
    ELSE jsonb_build_object('kind', 'report', 'report', jsonb_build_object(
        'outcome', CASE "status"
            WHEN 'completed' THEN 'done'
            WHEN 'pending_input' THEN 'needs-you'
            ELSE 'failed'
        END,
        'text', left(coalesce("summary", ''), 8000),
        'ask', CASE WHEN "status" = 'pending_input' THEN left(coalesce("summary", ''), 8000) END,
        'personId', NULL,
        'personRefused', NULL,
        'pullRequestUrls', coalesce((
            SELECT jsonb_agg(DISTINCT branch->>'pullRequestUrl')
            FROM jsonb_array_elements("branches") AS branch
            WHERE branch->>'pullRequestUrl' IS NOT NULL
        ), '[]'::jsonb),
        'source', 'provider',
        'messageId', NULL))
END
WHERE "outcome" IS NULL
    AND "status" IN ('pending_input', 'completed', 'failed', 'cancelled', 'expired');--> statement-breakpoint
-- A Message link to a Worker with a Task becomes a reference to that Task.
DO $$
DECLARE link record;
DECLARE reference text;
BEGIN
    FOR link IN
        SELECT l."server_id", l."message_id", l."worker_id", w."task_id",
            k."key" || '-' || t."number" AS "task_key"
        FROM "worker_history_links" AS l
        JOIN "workers" AS w ON w."server_id" = l."server_id" AND w."id" = l."worker_id"
        JOIN "tasks" AS t ON t."server_id" = w."server_id" AND t."id" = w."task_id"
        JOIN "task_keys" AS k ON k."id" = t."key_id"
        ORDER BY l."server_id", l."message_id", l."ordinal"
    LOOP
        reference := '[' || link."task_key" || '](task://' || link."task_id" || ')';
        UPDATE "chat_messages"
        SET "content" = regexp_replace(
            "content",
            '\[(?:[^]\\\n]|\\.)*\]\(cloud-agent://' || link."worker_id" || '\)',
            reference,
            'g'
        )
        WHERE "server_id" = link."server_id" AND "id" = link."message_id";
        INSERT INTO "task_message_links" ("message_id", "ordinal", "server_id", "task_id", "text")
        SELECT link."message_id", coalesce(max(existing."ordinal") + 1, 0), link."server_id",
            link."task_id", reference
        FROM "task_message_links" AS existing
        WHERE existing."message_id" = link."message_id"
        HAVING NOT bool_or(existing."task_id" = link."task_id" AND existing."text" = reference)
            OR count(*) = 0;
        DELETE FROM "worker_history_links"
        WHERE "server_id" = link."server_id" AND "message_id" = link."message_id"
            AND "worker_id" = link."worker_id";
    END LOOP;
END $$;--> statement-breakpoint
-- Links that stay point at taskless history under the Worker scheme.
UPDATE "chat_messages" SET "content" = replace("content", '](cloud-agent://', '](worker://')
WHERE "content" LIKE '%](cloud-agent://%';--> statement-breakpoint
-- Each Worker inbox row becomes its own kind by its notice.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('agent_inbox') AND attname = 'cloud_agent_notice'
            AND NOT attisdropped
    ) THEN
        ALTER TABLE "agent_inbox" DROP CONSTRAINT IF EXISTS "agent_inbox_cloud_agent_notice";
        UPDATE "agent_inbox" SET "source" = CASE "cloud_agent_notice"
            WHEN 'settled' THEN 'worker_report'
            WHEN 'stall' THEN 'worker_stall'
            ELSE 'pull_request'
        END
        WHERE "source" = 'cloud_agent_work';
        ALTER TABLE "agent_inbox" DROP COLUMN "cloud_agent_notice";
    END IF;
END $$;--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT IF EXISTS "agent_inbox_worker_shape";--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_worker_shape" CHECK (("agent_inbox"."worker_turn_id" is null
                    or "agent_inbox"."source" in ('worker_report', 'worker_stall', 'pull_request'))
                and ("agent_inbox"."source" not in ('worker_report', 'worker_stall')
                    or "agent_inbox"."worker_turn_id" is not null));--> statement-breakpoint
UPDATE "agent_run_triggers" SET "source" = 'worker_report' WHERE "source" = 'cloud_agent_work';--> statement-breakpoint
ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "chat_messages_body_kind";--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_body_kind" CHECK ("chat_messages"."body_kind" in ('text', 'agent-created', 'worker-report', 'worker-follow-up'));--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worker_place_limits" (
    "place" text NOT NULL,
    "server_id" text NOT NULL,
    "worker_limit" integer NOT NULL,
    CONSTRAINT "worker_place_limits_pkey" PRIMARY KEY("server_id","place"),
    CONSTRAINT "worker_place_limits_place" CHECK ("worker_place_limits"."place" in ('cursor', 'claude')),
    CONSTRAINT "worker_place_limits_limit" CHECK ("worker_place_limits"."worker_limit" between 1 and 50),
    CONSTRAINT "worker_place_limits_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action
);
