-- ADR 0037: humans are addressed by mention. Asks retire into ordinary text
-- Messages (content already holds the question), tasks become Agent-only,
-- and Needs you gains its mention column and Done marker.
-- Deferred foreign-key checks would otherwise leave trigger events pending
-- on tables this migration then alters.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
UPDATE "chat_messages" SET "body_kind" = 'text' WHERE "body_kind" = 'ask';--> statement-breakpoint
DELETE FROM "chat_events" WHERE "event_type" = 'ask.updated';--> statement-breakpoint
-- Human-held tasks become unassigned; a human's in-progress claim returns to todo.
UPDATE "message_tasks"
SET "claimed_at" = NULL,
    "status" = CASE WHEN "status" = 'in_progress' THEN 'todo' ELSE "status" END,
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "assignee_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_events" DROP CONSTRAINT "chat_events_ask_fk";--> statement-breakpoint
ALTER TABLE "message_tasks" DROP CONSTRAINT "message_tasks_assignee_membership_fk";--> statement-breakpoint
DROP TABLE "asks";--> statement-breakpoint
ALTER TABLE "chat_events" DROP CONSTRAINT "chat_events_shape";--> statement-breakpoint
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_body_kind";--> statement-breakpoint
ALTER TABLE "message_tasks" DROP CONSTRAINT "message_tasks_assignee_shape";--> statement-breakpoint
ALTER TABLE "message_tasks" DROP CONSTRAINT "message_tasks_claim_shape";--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "mentioned_user_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_reads" ADD COLUMN "done_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Same parse as the send paths: a `[label](user://<id>)` rich reference.
UPDATE "chat_messages" AS message
SET "mentioned_user_ids" = mentions.ids
FROM (
    SELECT source."server_id", source."id", array_agg(DISTINCT reference[1] ORDER BY reference[1]) AS ids
    FROM "chat_messages" AS source,
        regexp_matches(source."content", '\[[^]\n]+\]\(\s*user://([^)\s]+)\s*\)', 'g') AS reference
    WHERE source."content" LIKE '%user://%'
    GROUP BY source."server_id", source."id"
) AS mentions
WHERE message."server_id" = mentions."server_id" AND message."id" = mentions."id";--> statement-breakpoint
-- Needs you starts at the cutover: every human who can see a Chat has its
-- history marked Done (not read). A missing chat_reads row reads as sequence 0,
-- so inserted rows keep the read marker at 0 and unread counts stand.
INSERT INTO "chat_reads" ("server_id", "chat_id", "reader_user_id", "done_sequence")
SELECT DISTINCT chat."server_id", chat."id", audience."user_id", chat."last_message_sequence"
FROM "chats" AS chat
LEFT JOIN "chats" AS parent
    ON parent."server_id" = chat."server_id" AND parent."id" = chat."parent_chat_id"
CROSS JOIN LATERAL (
    SELECT coalesce(parent."dm_member_one_user_id", chat."dm_member_one_user_id") AS "user_id"
    UNION
    SELECT coalesce(parent."dm_member_two_user_id", chat."dm_member_two_user_id")
    UNION
    SELECT participant."user_id"
    FROM "channel_participants" AS participant
    WHERE participant."server_id" = chat."server_id"
        AND participant."chat_id" = coalesce(parent."id", chat."id")
) AS audience
JOIN "server_memberships" AS membership
    ON membership."server_id" = chat."server_id" AND membership."user_id" = audience."user_id"
WHERE chat."last_message_sequence" > 0
ON CONFLICT ("server_id", "chat_id", "reader_user_id")
DO UPDATE SET "done_sequence" = excluded."done_sequence";--> statement-breakpoint
CREATE INDEX "chat_messages_mentioned_users_idx" ON "chat_messages" USING gin ("mentioned_user_ids");--> statement-breakpoint
CREATE INDEX "chat_messages_author_user_idx" ON "chat_messages" USING btree ("server_id","chat_id","author_user_id","sequence") WHERE "chat_messages"."author_user_id" is not null;--> statement-breakpoint
CREATE INDEX "chat_messages_inline_reply_idx" ON "chat_messages" USING btree ("server_id","chat_id","sequence") WHERE "chat_messages"."reply_to_message_id" is not null;--> statement-breakpoint
ALTER TABLE "chat_events" DROP COLUMN "ask_id";--> statement-breakpoint
ALTER TABLE "message_tasks" DROP COLUMN "assignee_user_id";--> statement-breakpoint
ALTER TABLE "chat_events" ADD CONSTRAINT "chat_events_shape" CHECK ((
                ("chat_events"."event_type" = 'cloud-agent-work.updated'
                    AND "chat_events"."cloud_agent_work_id" IS NOT NULL
                    AND "chat_events"."chat_id" IS NOT NULL
                    AND "chat_events"."message_id" IS NOT NULL
                    AND "chat_events"."label_id" IS NULL
                    AND "chat_events"."reader_user_id" IS NULL
                    AND "chat_events"."reminder_id" IS NULL
                    AND "chat_events"."reminder_action" IS NULL
                    AND "chat_events"."sequence" > 0)
                OR
                ("chat_events"."event_type" = 'message.created'
                    AND "chat_events"."chat_id" IS NOT NULL
                    AND "chat_events"."message_id" IS NOT NULL
                    AND "chat_events"."label_id" IS NULL
                    AND "chat_events"."reader_user_id" IS NULL
                    AND "chat_events"."reminder_id" IS NULL
                    AND "chat_events"."reminder_action" IS NULL
                    AND "chat_events"."cloud_agent_work_id" IS NULL
                    AND "chat_events"."sequence" > 0)
                OR
                ("chat_events"."event_type" = 'message.reaction.updated'
                    AND "chat_events"."chat_id" IS NOT NULL
                    AND "chat_events"."message_id" IS NOT NULL
                    AND "chat_events"."label_id" IS NULL
                    AND "chat_events"."reader_user_id" IS NULL
                    AND "chat_events"."reminder_id" IS NULL
                    AND "chat_events"."reminder_action" IS NULL
                    AND "chat_events"."cloud_agent_work_id" IS NULL
                    AND "chat_events"."sequence" > 0)
                OR
                ("chat_events"."event_type" = 'chat.lifecycle'
                    AND "chat_events"."chat_id" IS NULL
                    AND "chat_events"."lifecycle_chat_id" IS NOT NULL
                    AND "chat_events"."chat_action" IN (
                        'archived', 'created', 'deleted', 'unarchived', 'updated'
                    )
                    AND "chat_events"."message_id" IS NULL
                    AND "chat_events"."label_id" IS NULL
                    AND "chat_events"."reader_user_id" IS NULL
                    AND "chat_events"."reminder_id" IS NULL
                    AND "chat_events"."reminder_action" IS NULL
                    AND "chat_events"."cloud_agent_work_id" IS NULL
                    AND "chat_events"."sequence" = 0)
                OR
                ("chat_events"."event_type" IN ('task.created', 'task.updated')
                    AND "chat_events"."chat_id" IS NOT NULL
                    AND "chat_events"."message_id" IS NOT NULL
                    AND "chat_events"."label_id" IS NULL
                    AND "chat_events"."reader_user_id" IS NULL
                    AND "chat_events"."reminder_id" IS NULL
                    AND "chat_events"."reminder_action" IS NULL
                    AND "chat_events"."cloud_agent_work_id" IS NULL
                    AND "chat_events"."sequence" > 0)
                OR
                ("chat_events"."event_type" = 'chat.read'
                    AND "chat_events"."chat_id" IS NOT NULL
                    AND "chat_events"."message_id" IS NULL
                    AND "chat_events"."label_id" IS NULL
                    AND "chat_events"."reader_user_id" IS NOT NULL
                    AND "chat_events"."reminder_id" IS NULL
                    AND "chat_events"."reminder_action" IS NULL
                    AND "chat_events"."cloud_agent_work_id" IS NULL
                    AND "chat_events"."sequence" >= 0)
                OR
                ("chat_events"."event_type" = 'thread.follow.updated'
                    AND "chat_events"."chat_id" IS NOT NULL
                    AND "chat_events"."message_id" IS NULL
                    AND "chat_events"."label_id" IS NULL
                    AND "chat_events"."reader_user_id" IS NOT NULL
                    AND "chat_events"."reminder_id" IS NULL
                    AND "chat_events"."reminder_action" IS NULL
                    AND "chat_events"."cloud_agent_work_id" IS NULL
                    AND "chat_events"."sequence" >= 0)
                OR
                ("chat_events"."event_type" = 'reminder.changed'
                    AND "chat_events"."chat_id" IS NOT NULL
                    AND "chat_events"."message_id" IS NULL
                    AND "chat_events"."label_id" IS NULL
                    AND "chat_events"."reader_user_id" IS NULL
                    AND "chat_events"."reminder_id" IS NOT NULL
                    AND "chat_events"."reminder_action" IN (
                        'scheduled', 'updated', 'snoozed', 'canceled', 'fired'
                    )
                    AND "chat_events"."cloud_agent_work_id" IS NULL
                    AND "chat_events"."sequence" >= 0)
                OR
                ("chat_events"."event_type" = 'task.label.updated'
                    AND "chat_events"."chat_id" IS NULL
                    AND "chat_events"."message_id" IS NULL
                    AND "chat_events"."label_id" IS NOT NULL
                    AND "chat_events"."reader_user_id" IS NULL
                    AND "chat_events"."reminder_id" IS NULL
                    AND "chat_events"."reminder_action" IS NULL
                    AND "chat_events"."cloud_agent_work_id" IS NULL
                    AND "chat_events"."sequence" = 0)
            ));--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_body_kind" CHECK ("chat_messages"."body_kind" in ('text', 'cloud-agent-work', 'agent-created'));--> statement-breakpoint
ALTER TABLE "message_tasks" ADD CONSTRAINT "message_tasks_claim_shape" CHECK ("message_tasks"."claimed_at" is null or "message_tasks"."assignee_agent_id" is not null);