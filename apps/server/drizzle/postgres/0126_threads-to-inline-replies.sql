-- ADR 0053 decision 14: every Thread becomes inline replies on its anchor
-- Message in the parent Channel or DM, then the Thread Chats are deleted.
-- The audit tables keep everything needed to check and (on a dev database)
-- replay the move backwards: `thread_migration_map` holds every renumbered
-- Message's before and after position, `thread_migration_rows` the
-- before-image of every other row this migration changes or deletes.
-- `scripts/verify-thread-migration.ts` checks the result and
-- `scripts/reverse-thread-migration.ts` reverses it on a dev database.
CREATE TABLE "thread_migration_map" (
    "server_id" text NOT NULL,
    "message_id" text PRIMARY KEY NOT NULL,
    "old_chat_id" text NOT NULL,
    "new_chat_id" text NOT NULL,
    "old_sequence" integer NOT NULL,
    "new_sequence" integer NOT NULL,
    "old_nonce" text NOT NULL,
    "new_nonce" text NOT NULL,
    "old_reply_to_message_id" text,
    "old_reply_root_message_id" text,
    "new_reply_to_message_id" text,
    "new_reply_root_message_id" text
);--> statement-breakpoint
CREATE INDEX "thread_migration_map_old_position_idx"
    ON "thread_migration_map" ("server_id", "old_chat_id", "old_sequence");--> statement-breakpoint
CREATE TABLE "thread_migration_rows" (
    "table_name" text NOT NULL,
    "row" jsonb NOT NULL
);--> statement-breakpoint
CREATE INDEX "thread_migration_rows_table_idx" ON "thread_migration_rows" ("table_name");--> statement-breakpoint
-- Every Thread, its parent, its anchor, and the anchor's inline root. The
-- position orders Threads under one parent for sequence ties.
CREATE TEMP TABLE "migrating_threads" ON COMMIT DROP AS
SELECT
    thread."server_id",
    thread."id" AS "thread_id",
    thread."parent_chat_id",
    thread."anchor_message_id",
    coalesce(anchor."reply_root_message_id", anchor."id") AS "anchor_root_message_id",
    row_number() OVER (
        PARTITION BY thread."server_id", thread."parent_chat_id"
        ORDER BY thread."created_at", thread."id"
    )::integer AS "position"
FROM "chats" thread
JOIN "chat_messages" anchor
    ON anchor."server_id" = thread."server_id"
    AND anchor."chat_id" = thread."parent_chat_id"
    AND anchor."id" = thread."anchor_message_id"
WHERE thread."kind" = 'thread';--> statement-breakpoint
CREATE TEMP TABLE "migrating_chats" ON COMMIT DROP AS
SELECT "server_id", "thread_id" AS "chat_id", 'thread'::text AS "role" FROM "migrating_threads"
UNION
SELECT DISTINCT "server_id", "parent_chat_id", 'parent'::text FROM "migrating_threads";--> statement-breakpoint
DO $$
BEGIN
    IF (SELECT count(*) FROM "chats" WHERE "kind" = 'thread')
        <> (SELECT count(*) FROM "migrating_threads") THEN
        RAISE EXCEPTION 'thread migration: a Thread has no anchor Message in its parent Chat';
    END IF;
    -- The product never soft-deletes a Thread on its own; moving a hidden
    -- Thread's replies into a visible parent would surface them.
    IF EXISTS (SELECT 1 FROM "chats" WHERE "kind" = 'thread' AND "deleted_at" IS NOT NULL) THEN
        RAISE EXCEPTION 'thread migration: a soft-deleted Thread needs an operator decision first';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "chat_messages" message
        JOIN "migrating_chats" scope
            ON scope."server_id" = message."server_id" AND scope."chat_id" = message."chat_id"
        WHERE message."sequence" >= 1000000000
    ) THEN
        RAISE EXCEPTION 'thread migration: a sequence is too large for the renumbering offset';
    END IF;
END $$;--> statement-breakpoint
-- 1. The audit map, before anything changes. Each Message keeps its own Chat's
-- order (`ordered_at` is its Chat's running max `created_at`), and the merged
-- order is (time, parent before Threads, Thread age, old sequence). A moved
-- top-level reply answers the anchor; a moved inline reply keeps its parent.
-- Every moved Message roots at the anchor's root. A moved Message whose nonce
-- already exists in the parent gets its old Thread id as a suffix.
INSERT INTO "thread_migration_map" (
    "server_id", "message_id", "old_chat_id", "new_chat_id", "old_sequence", "new_sequence",
    "old_nonce", "new_nonce", "old_reply_to_message_id", "old_reply_root_message_id",
    "new_reply_to_message_id", "new_reply_root_message_id"
)
SELECT
    source."server_id",
    source."id",
    source."chat_id",
    source."target_chat_id",
    source."sequence",
    row_number() OVER (
        PARTITION BY source."server_id", source."target_chat_id"
        ORDER BY source."ordered_at", source."chat_position", source."sequence"
    )::integer,
    source."nonce",
    CASE
        WHEN source."moved" AND count(*) OVER (
            PARTITION BY source."server_id", source."target_chat_id", source."nonce"
        ) > 1 THEN source."nonce" || '~' || source."chat_id"
        ELSE source."nonce"
    END,
    source."reply_to_message_id",
    source."reply_root_message_id",
    CASE WHEN source."moved"
        THEN coalesce(source."reply_to_message_id", source."anchor_message_id")
        ELSE source."reply_to_message_id"
    END,
    CASE WHEN source."moved"
        THEN source."anchor_root_message_id"
        ELSE source."reply_root_message_id"
    END
FROM (
    SELECT
        message.*,
        thread."thread_id" IS NOT NULL AS "moved",
        coalesce(thread."parent_chat_id", message."chat_id") AS "target_chat_id",
        coalesce(thread."position", 0) AS "chat_position",
        thread."anchor_message_id",
        thread."anchor_root_message_id",
        max(message."created_at") OVER (
            PARTITION BY message."server_id", message."chat_id"
            ORDER BY message."sequence"
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS "ordered_at"
    FROM "chat_messages" message
    JOIN "migrating_chats" scope
        ON scope."server_id" = message."server_id" AND scope."chat_id" = message."chat_id"
    LEFT JOIN "migrating_threads" thread
        ON thread."server_id" = message."server_id" AND thread."thread_id" = message."chat_id"
) source;--> statement-breakpoint
-- The before-image of every row in the moving Chats' reach, from every table
-- that stores a Chat id (found by scanning the schema for chat id columns).
INSERT INTO "thread_migration_rows" ("table_name", "row")
SELECT 'chats', to_jsonb(t) FROM "chats" t
    WHERE ("server_id", "id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'chat_reads', to_jsonb(t) FROM "chat_reads" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'agent_chat_reads', to_jsonb(t) FROM "agent_chat_reads" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'agent_inbox_cursors', to_jsonb(t) FROM "agent_inbox_cursors" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'agent_inbox_exact_visibility', to_jsonb(t) FROM "agent_inbox_exact_visibility" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'agent_message_drafts', to_jsonb(t) FROM "agent_message_drafts" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'agent_inbox', to_jsonb(t) FROM "agent_inbox" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'thread_follows', to_jsonb(t) FROM "thread_follows" t
    WHERE ("server_id", "thread_chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'agent_thread_follows', to_jsonb(t) FROM "agent_thread_follows" t
    WHERE ("server_id", "thread_chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'thread_closures', to_jsonb(t) FROM "thread_closures" t
    WHERE ("server_id", "thread_chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'reminders', to_jsonb(t) FROM "reminders" t
    WHERE ("server_id", "anchor_chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'reminder_agent_attention', to_jsonb(t) FROM "reminder_agent_attention" t
    WHERE ("server_id", "anchor_chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'triggers', to_jsonb(t) FROM "triggers" t
    WHERE ("server_id", "anchor_chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'cloud_agent_work', to_jsonb(t) FROM "cloud_agent_work" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'cloud_agent_work_links', to_jsonb(t) FROM "cloud_agent_work_links" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'image_generation_links', to_jsonb(t) FROM "image_generation_links" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'message_claims', to_jsonb(t) FROM "message_claims" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'attachments', to_jsonb(t) FROM "attachments" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'agent_run_triggers', to_jsonb(t) FROM "agent_run_triggers" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'agent_runner_credentials', to_jsonb(t) FROM "agent_runner_credentials" t
    WHERE ("server_id", "chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'agent_delivery', to_jsonb(t) FROM "agent_delivery" t
    WHERE ("server_id", "active_run_chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats")
UNION ALL SELECT 'message_causes', to_jsonb(t) FROM "message_causes" t
    WHERE ("server_id", "anchor_chat_id") IN (SELECT "server_id", "chat_id" FROM "migrating_chats");--> statement-breakpoint
-- 2. Keys that name a Message by (Chat, id) are checked at commit while the
-- Messages and their referrers move separately; they return to immediate at
-- the end. The others involved were already deferred (0002's rule).
ALTER TABLE "chat_messages" ALTER CONSTRAINT "chat_messages_reply_parent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER CONSTRAINT "chat_messages_reply_root_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "cloud_agent_work_links" ALTER CONSTRAINT "cloud_agent_work_links_message_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "image_generation_links" ALTER CONSTRAINT "image_generation_links_message_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "message_claims" ALTER CONSTRAINT "message_claims_message_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "agent_message_drafts" ALTER CONSTRAINT "agent_message_drafts_reply_parent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;--> statement-breakpoint
-- 3 and 4. Move and renumber in two passes so the per-Chat sequence and nonce
-- keys hold after every row: first into an offset range, then down.
UPDATE "chat_messages" message
SET
    "chat_id" = map."new_chat_id",
    "sequence" = map."new_sequence" + 1000000000,
    "nonce" = map."new_nonce",
    "reply_to_message_id" = map."new_reply_to_message_id",
    "reply_root_message_id" = map."new_reply_root_message_id"
FROM "thread_migration_map" map
WHERE message."server_id" = map."server_id" AND message."id" = map."message_id";--> statement-breakpoint
UPDATE "chat_messages" message
SET "sequence" = message."sequence" - 1000000000
FROM "migrating_chats" scope
WHERE scope."role" = 'parent'
    AND message."server_id" = scope."server_id"
    AND message."chat_id" = scope."chat_id"
    AND message."sequence" > 1000000000;--> statement-breakpoint
UPDATE "chats" parent
SET
    "last_message_sequence" = (
        SELECT coalesce(max(map."new_sequence"), 0) FROM "thread_migration_map" map
        WHERE map."server_id" = parent."server_id" AND map."new_chat_id" = parent."id"
    ),
    "last_activity_at" = greatest(
        parent."last_activity_at",
        (
            SELECT max(thread_chat."last_activity_at")
            FROM "migrating_threads" thread
            JOIN "chats" thread_chat
                ON thread_chat."server_id" = thread."server_id" AND thread_chat."id" = thread."thread_id"
            WHERE thread."server_id" = parent."server_id" AND thread."parent_chat_id" = parent."id"
        )
    )
FROM "migrating_chats" scope
WHERE scope."role" = 'parent' AND parent."server_id" = scope."server_id" AND parent."id" = scope."chat_id";--> statement-breakpoint
-- 5. Stored positions. An affected Chat (one that received moved Messages) is
-- read through its newest Message for every person and Agent who can read it,
-- so the move surfaces no old conversation as unread (product decision
-- 2026-11-18). A Chat that received nothing keeps every position untouched.
-- Readers match the verifier: current members who can read the Chat (anyone
-- for a Channel, its two people for a DM) and active Agents (any for a
-- Channel, the DM's own Agent for a DM). Existing rows for anyone else move
-- too, since a rejoin reads from the stored position.
CREATE TEMP TABLE "affected_chats" ON COMMIT DROP AS
SELECT
    chat."server_id",
    chat."id" AS "chat_id",
    chat."kind",
    chat."last_message_sequence" AS "newest",
    chat."dm_member_one_user_id",
    chat."dm_member_two_user_id",
    chat."dm_agent_id"
FROM "chats" chat
WHERE EXISTS (
    SELECT 1 FROM "thread_migration_map" map
    WHERE map."server_id" = chat."server_id"
        AND map."new_chat_id" = chat."id"
        AND map."old_chat_id" <> map."new_chat_id"
);--> statement-breakpoint
UPDATE "chat_reads" reading
SET "sequence" = chat."newest", "done_sequence" = chat."newest", "updated_at" = now()
FROM "affected_chats" chat
WHERE reading."server_id" = chat."server_id" AND reading."chat_id" = chat."chat_id";--> statement-breakpoint
INSERT INTO "chat_reads" ("server_id", "chat_id", "reader_user_id", "sequence", "done_sequence")
SELECT chat."server_id", chat."chat_id", member."user_id", chat."newest", chat."newest"
FROM "affected_chats" chat
JOIN "server_memberships" member
    ON member."server_id" = chat."server_id"
    AND member."revoked_at" IS NULL
    AND (chat."kind" <> 'dm' OR member."user_id" IN (chat."dm_member_one_user_id", chat."dm_member_two_user_id"))
ON CONFLICT ("server_id", "chat_id", "reader_user_id") DO NOTHING;--> statement-breakpoint
UPDATE "agent_chat_reads" reading
SET "sequence" = chat."newest", "updated_at" = now()
FROM "affected_chats" chat
WHERE reading."server_id" = chat."server_id" AND reading."chat_id" = chat."chat_id";--> statement-breakpoint
INSERT INTO "agent_chat_reads" ("server_id", "agent_id", "chat_id", "sequence")
SELECT chat."server_id", agent."id", chat."chat_id", chat."newest"
FROM "affected_chats" chat
JOIN "agents" agent
    ON agent."server_id" = chat."server_id"
    AND agent."retired_at" IS NULL
    AND (chat."kind" <> 'dm' OR agent."id" = chat."dm_agent_id")
ON CONFLICT ("server_id", "agent_id", "chat_id") DO NOTHING;--> statement-breakpoint
-- A session's freshness cursors move with the read position, so no hold
-- re-shows the moved history (the boundary `markCursorSubsumedSeen` reads).
UPDATE "agent_inbox_cursors" position_row
SET "seen_up_to_sequence" = chat."newest", "held_through_sequence" = chat."newest", "updated_at" = now()
FROM "affected_chats" chat
WHERE position_row."server_id" = chat."server_id" AND position_row."chat_id" = chat."chat_id";--> statement-breakpoint
DELETE FROM "chat_reads" WHERE ("server_id", "chat_id") IN (SELECT "server_id", "thread_id" FROM "migrating_threads");--> statement-breakpoint
DELETE FROM "agent_chat_reads" WHERE ("server_id", "chat_id") IN (SELECT "server_id", "thread_id" FROM "migrating_threads");--> statement-breakpoint
DELETE FROM "agent_inbox_cursors" WHERE ("server_id", "chat_id") IN (SELECT "server_id", "thread_id" FROM "migrating_threads");--> statement-breakpoint
-- 6. Repoint every other reference. One held draft per session and Chat: the
-- parent's own wins, else the newest Thread draft; a moved draft answers the
-- anchor unless it already answered a reply.
DELETE FROM "agent_message_drafts" draft
USING "migrating_threads" thread
WHERE draft."server_id" = thread."server_id"
    AND draft."chat_id" = thread."thread_id"
    AND EXISTS (
        SELECT 1
        FROM "agent_message_drafts" rival
        LEFT JOIN "migrating_threads" rival_thread
            ON rival_thread."server_id" = rival."server_id" AND rival_thread."thread_id" = rival."chat_id"
        WHERE rival."server_id" = draft."server_id"
            AND rival."agent_id" = draft."agent_id"
            AND rival."session_generation" = draft."session_generation"
            AND (
                rival."chat_id" = thread."parent_chat_id"
                OR (
                    rival_thread."parent_chat_id" = thread."parent_chat_id"
                    AND (rival."saved_at", rival."chat_id") > (draft."saved_at", draft."chat_id")
                )
            )
    );--> statement-breakpoint
UPDATE "agent_message_drafts" draft
SET
    "chat_id" = thread."parent_chat_id",
    "reply_to_message_id" = coalesce(draft."reply_to_message_id", thread."anchor_message_id")
FROM "migrating_threads" thread
WHERE draft."server_id" = thread."server_id" AND draft."chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "agent_inbox" t SET "chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."chat_id" = thread."thread_id";--> statement-breakpoint
-- Queued deliveries of Messages in an affected Chat, moved or not, are now
-- covered by the read position, so they settle `seen` the way
-- `markCursorSubsumedSeen` retires queued rows behind a seen boundary: no
-- Agent wakes to old conversation. Rows a live run holds, and attentions not
-- backed by a Message, are left to their own lifecycle.
UPDATE "agent_inbox" pending
SET "state" = 'seen', "seen_at" = now()
FROM "affected_chats" chat, "chat_messages" message
WHERE pending."server_id" = chat."server_id"
    AND pending."chat_id" = chat."chat_id"
    AND pending."state" = 'queued'
    AND pending."run_id" IS NULL
    AND message."server_id" = pending."server_id"
    AND message."id" = pending."dedupe_key"
    AND message."chat_id" = chat."chat_id";--> statement-breakpoint
UPDATE "agent_inbox_exact_visibility" t SET "chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "attachments" t SET "chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "cloud_agent_work" t SET "chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "cloud_agent_work_links" t SET "chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "image_generation_links" t SET "chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."chat_id" = thread."thread_id";--> statement-breakpoint
-- A claim already names the parent; clearing its Thread makes its Message's
-- Chat the parent too (`message_chat_id` is generated).
UPDATE "message_claims" t SET "thread_chat_id" = NULL FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."thread_chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "reminders" t SET "anchor_chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."anchor_chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "reminder_agent_attention" t SET "anchor_chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."anchor_chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "triggers" t SET "anchor_chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."anchor_chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "agent_run_triggers" t SET "chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "agent_runner_credentials" t SET "chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "agent_delivery" t SET "active_run_chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."active_run_chat_id" = thread."thread_id";--> statement-breakpoint
UPDATE "message_causes" t SET "anchor_chat_id" = thread."parent_chat_id" FROM "migrating_threads" thread
WHERE t."server_id" = thread."server_id" AND t."anchor_chat_id" = thread."thread_id";--> statement-breakpoint
-- 7. A Channel has no per-Message follow, and Open Threads closures end with
-- their Threads. Task follows stay.
DELETE FROM "thread_follows" WHERE ("server_id", "thread_chat_id") IN (SELECT "server_id", "thread_id" FROM "migrating_threads");--> statement-breakpoint
DELETE FROM "agent_thread_follows" WHERE ("server_id", "thread_chat_id") IN (SELECT "server_id", "thread_id" FROM "migrating_threads");--> statement-breakpoint
DELETE FROM "thread_closures" WHERE ("server_id", "thread_chat_id") IN (SELECT "server_id", "thread_id" FROM "migrating_threads");--> statement-breakpoint
-- 8. Nothing may still name a Thread, so deleting them cascades to nothing:
-- every key into `chats` and every `*chat_id` column is checked.
DO $$
DECLARE
    reference record;
    leftover bigint;
BEGIN
    FOR reference IN
        SELECT DISTINCT column_ref."table_name" AS table_name, column_ref."column_name" AS column_name
        FROM (
            SELECT c."table_name", c."column_name"
            FROM information_schema.columns c
            WHERE c."table_schema" = 'public'
                AND c."data_type" = 'text'
                AND c."column_name" LIKE '%chat_id'
                AND c."table_name" NOT LIKE 'thread_migration_%'
            UNION
            SELECT con.conrelid::regclass::text, attribute.attname::text
            FROM pg_constraint con
            CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS key_pair(local_key, foreign_key)
            JOIN pg_attribute foreign_attribute
                ON foreign_attribute.attrelid = con.confrelid AND foreign_attribute.attnum = key_pair.foreign_key
            JOIN pg_attribute attribute
                ON attribute.attrelid = con.conrelid AND attribute.attnum = key_pair.local_key
            WHERE con.contype = 'f'
                AND con.confrelid = 'public.chats'::regclass
                AND foreign_attribute.attname = 'id'
        ) column_ref
    LOOP
        EXECUTE format(
            'SELECT count(*) FROM %I WHERE %I IN (SELECT thread_id FROM migrating_threads)',
            reference.table_name,
            reference.column_name
        ) INTO leftover;
        IF leftover > 0 THEN
            RAISE EXCEPTION 'thread migration: %.% still names % Thread(s)',
                reference.table_name, reference.column_name, leftover;
        END IF;
    END LOOP;
END $$;--> statement-breakpoint
DELETE FROM "chats" WHERE ("server_id", "id") IN (SELECT "server_id", "thread_id" FROM "migrating_threads");--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "chats" WHERE "kind" = 'thread') THEN
        RAISE EXCEPTION 'thread migration: a Thread Chat remains';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM "chats" parent
        JOIN "migrating_chats" scope
            ON scope."role" = 'parent' AND scope."server_id" = parent."server_id" AND scope."chat_id" = parent."id"
        LEFT JOIN LATERAL (
            SELECT count(*) AS total, coalesce(max(message."sequence"), 0) AS newest
            FROM "chat_messages" message
            WHERE message."server_id" = parent."server_id" AND message."chat_id" = parent."id"
        ) stats ON true
        WHERE stats.total <> stats.newest OR parent."last_message_sequence" <> stats.newest
    ) THEN
        RAISE EXCEPTION 'thread migration: a parent Chat''s sequences are not dense up to its last sequence';
    END IF;
END $$;--> statement-breakpoint
-- Check every deferred key now, then return the borrowed keys to immediate.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER CONSTRAINT "chat_messages_reply_parent_fk" NOT DEFERRABLE;--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER CONSTRAINT "chat_messages_reply_root_fk" NOT DEFERRABLE;--> statement-breakpoint
ALTER TABLE "cloud_agent_work_links" ALTER CONSTRAINT "cloud_agent_work_links_message_fk" NOT DEFERRABLE;--> statement-breakpoint
ALTER TABLE "image_generation_links" ALTER CONSTRAINT "image_generation_links_message_fk" NOT DEFERRABLE;--> statement-breakpoint
ALTER TABLE "message_claims" ALTER CONSTRAINT "message_claims_message_fk" NOT DEFERRABLE;--> statement-breakpoint
ALTER TABLE "agent_message_drafts" ALTER CONSTRAINT "agent_message_drafts_reply_parent_fk" NOT DEFERRABLE;--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;
