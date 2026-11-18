-- ADR 0053 decisions 2, 4, 10, and 11: boards, columns, and the Task Inbox go,
-- `tasks.state` is the only state, and every Task is numbered by its key-ledger
-- entry. Legacy Tasks (no origin Message, no Chat) become places when an Agent
-- is working them and read-only history otherwise (product decision
-- 2026-11-18):
--   - todo or open with an Agent assignee: an origin Message (the earliest
--     Channel Message that links the Task, else a new "Tracking" Message by the
--     assignee in `#all`), a `task` Chat under it, and seeded followers;
--   - todo or open with no Agent assignee: canceled, chatless;
--   - done or canceled: unchanged, chatless.
-- Ids this migration mints are derived from the Task id, so a replay is stable.
CREATE FUNCTION pg_temp.legacy_task_id(prefix text, seed text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT prefix || '_' || translate(
        encode(substring(sha256(convert_to(seed, 'UTF8')) FROM 1 FOR 12), 'base64'),
        '+/', '-_'
    )
$$;--> statement-breakpoint
-- 1. A chatless Task's column decided its state until now (`readTasks`); the
-- state column takes that over before columns go.
UPDATE "tasks" task
SET "state" = CASE board_column."category"
    WHEN 'backlog' THEN 'todo'
    WHEN 'todo' THEN 'todo'
    WHEN 'active' THEN 'open'
    WHEN 'done' THEN 'done'
    WHEN 'canceled' THEN 'canceled'
END
FROM "board_columns" board_column
WHERE task."chat_id" IS NULL AND board_column."id" = task."column_id";--> statement-breakpoint
-- 2. Every board is a ledger entry under its own id (0124 and every board
-- written since), and the ledger alone counts: each entry's next number passes
-- its board's counter and every number already taken.
INSERT INTO "task_keys" ("id", "server_id", "key", "next_number", "created_at")
SELECT board."id", board."server_id", board."key", board."next_number", board."created_at"
FROM "boards" board
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "tasks" SET "key_id" = "board_id" WHERE "key_id" IS NULL;--> statement-breakpoint
UPDATE "task_keys" entry
SET "next_number" = greatest(
    entry."next_number",
    coalesce((
        SELECT board."next_number" FROM "boards" board
        WHERE board."server_id" = entry."server_id" AND board."id" = entry."id"
    ), 1),
    coalesce((
        SELECT max(task."number") + 1 FROM "tasks" task
        WHERE task."server_id" = entry."server_id" AND task."key_id" = entry."id"
    ), 1)
);--> statement-breakpoint
-- A Channel without a key takes its Server's General one, by 0124's rule.
UPDATE "chats"
SET "task_key_id" = general."id"
FROM (
    SELECT DISTINCT ON ("server_id") "server_id", "id"
    FROM "boards"
    WHERE "created_by_user_id" IS NULL AND "created_by_agent_id" IS NULL
    ORDER BY "server_id", ("key" = 'GEN') DESC, "created_at", "id"
) AS general
WHERE "chats"."server_id" = general."server_id"
    AND "chats"."kind" = 'channel'
    AND "chats"."task_key_id" IS NULL;--> statement-breakpoint
-- 3. The Tasks that become places, and the earliest live Channel Message that
-- links each, when there is one.
CREATE TEMP TABLE "legacy_task_places" ON COMMIT DROP AS
SELECT
    task."server_id",
    task."id" AS "task_id",
    task."assignee_agent_id",
    task."created_by_user_id",
    task."created_at",
    entry."key" || '-' || task."number" AS "task_key",
    task."title",
    origin."chat_id" AS "origin_chat_id",
    origin."message_id" AS "origin_message_id",
    pg_temp.legacy_task_id('cht', 'task-chat:' || task."id") AS "chat_id"
FROM "tasks" task
JOIN "task_keys" entry ON entry."server_id" = task."server_id" AND entry."id" = task."key_id"
LEFT JOIN LATERAL (
    SELECT message."chat_id", message."id" AS "message_id"
    FROM "task_message_links" link
    JOIN "chat_messages" message
        ON message."server_id" = link."server_id" AND message."id" = link."message_id"
    JOIN "chats" channel
        ON channel."server_id" = message."server_id" AND channel."id" = message."chat_id"
    WHERE link."server_id" = task."server_id"
        AND link."task_id" = task."id"
        AND channel."kind" = 'channel'
        AND channel."deleted_at" IS NULL
    ORDER BY message."created_at", message."sequence", message."id"
    LIMIT 1
) origin ON true
WHERE task."chat_id" IS NULL
    AND task."state" IN ('todo', 'open')
    AND task."assignee_agent_id" IS NOT NULL;--> statement-breakpoint
-- 4. A Task no Channel Message links gets one: its assignee posts "Tracking
-- KEY-n: title" in `#all`, appended after that Channel's newest Message in
-- Task age order, with the key linked like any written reference.
CREATE TEMP TABLE "legacy_task_posts" ON COMMIT DROP AS
SELECT
    place."server_id",
    place."task_id",
    place."assignee_agent_id",
    place."task_key",
    'Tracking ' || place."task_key" || ': ' || place."title" AS "content",
    all_channel."id" AS "chat_id",
    all_channel."last_message_sequence" + row_number() OVER (
        PARTITION BY place."server_id"
        ORDER BY place."created_at", place."task_id"
    )::integer AS "sequence",
    pg_temp.legacy_task_id('msg', 'task-origin:' || place."task_id") AS "message_id"
FROM "legacy_task_places" place
JOIN "chats" all_channel
    ON all_channel."server_id" = place."server_id"
    AND all_channel."kind" = 'channel'
    AND all_channel."is_all"
WHERE place."origin_message_id" IS NULL;--> statement-breakpoint
DO $$
BEGIN
    IF (SELECT count(*) FROM "legacy_task_places" WHERE "origin_message_id" IS NULL)
        <> (SELECT count(*) FROM "legacy_task_posts") THEN
        RAISE EXCEPTION 'legacy tasks: a Server with a Task to track has no #all Channel';
    END IF;
END $$;--> statement-breakpoint
INSERT INTO "chat_messages" (
    "id", "server_id", "chat_id", "sequence", "nonce", "content", "author_agent_id", "created_at"
)
SELECT
    post."message_id",
    post."server_id",
    post."chat_id",
    post."sequence",
    'task-origin:' || post."task_id",
    post."content",
    post."assignee_agent_id",
    now()
FROM "legacy_task_posts" post;--> statement-breakpoint
INSERT INTO "task_message_links" ("message_id", "ordinal", "server_id", "task_id", "text")
SELECT post."message_id", 0, post."server_id", post."task_id", post."task_key"
FROM "legacy_task_posts" post;--> statement-breakpoint
UPDATE "chats" all_channel
SET
    "last_message_sequence" = posted."newest",
    "last_activity_at" = greatest(all_channel."last_activity_at", now())
FROM (
    SELECT "server_id", "chat_id", max("sequence") AS "newest"
    FROM "legacy_task_posts"
    GROUP BY "server_id", "chat_id"
) posted
WHERE all_channel."server_id" = posted."server_id" AND all_channel."id" = posted."chat_id";--> statement-breakpoint
UPDATE "legacy_task_places" place
SET "origin_chat_id" = post."chat_id", "origin_message_id" = post."message_id"
FROM "legacy_task_posts" post
WHERE post."server_id" = place."server_id" AND post."task_id" = place."task_id";--> statement-breakpoint
-- 5. Each Task's own Chat under its origin, and the Task's link to it.
INSERT INTO "chats" ("id", "server_id", "kind", "parent_chat_id", "parent_chat_kind", "anchor_message_id")
SELECT place."chat_id", place."server_id", 'task', place."origin_chat_id", 'channel', place."origin_message_id"
FROM "legacy_task_places" place;--> statement-breakpoint
UPDATE "tasks" task
SET "chat_id" = place."chat_id", "updated_at" = now(), "version" = task."version" + 1
FROM "legacy_task_places" place
WHERE task."server_id" = place."server_id" AND task."id" = place."task_id";--> statement-breakpoint
-- 6. Followers: the origin Message's author and the Task's creator when they
-- are current members, and the assignee Agent, whose read position opens at
-- the empty Chat's start (`openAgentChatRead`).
INSERT INTO "thread_follows" ("server_id", "thread_chat_id", "thread_chat_kind", "user_id", "followed")
SELECT DISTINCT place."server_id", place."chat_id", 'task', follower."user_id", true
FROM "legacy_task_places" place
JOIN "chat_messages" origin
    ON origin."server_id" = place."server_id" AND origin."id" = place."origin_message_id"
CROSS JOIN LATERAL (
    VALUES (origin."author_user_id"), (place."created_by_user_id")
) AS follower("user_id")
JOIN "server_memberships" member
    ON member."server_id" = place."server_id"
    AND member."user_id" = follower."user_id"
    AND member."revoked_at" IS NULL;--> statement-breakpoint
INSERT INTO "agent_thread_follows" ("server_id", "agent_id", "thread_chat_id", "thread_chat_kind", "followed")
SELECT place."server_id", place."assignee_agent_id", place."chat_id", 'task', true
FROM "legacy_task_places" place;--> statement-breakpoint
INSERT INTO "agent_chat_reads" ("server_id", "agent_id", "chat_id", "sequence")
SELECT place."server_id", place."assignee_agent_id", place."chat_id", 0
FROM "legacy_task_places" place;--> statement-breakpoint
-- 7. Every other unfinished legacy Task is canceled into history. Then
-- `completed_at` is set exactly while a Task is closed.
UPDATE "tasks"
SET "state" = 'canceled', "updated_at" = now(), "version" = "version" + 1
WHERE "chat_id" IS NULL AND "state" IN ('todo', 'open');--> statement-breakpoint
UPDATE "tasks"
SET "completed_at" = CASE
    WHEN "state" IN ('done', 'canceled') THEN coalesce("completed_at", "updated_at")
END
WHERE ("completed_at" IS NOT NULL) <> ("state" IN ('done', 'canceled'));--> statement-breakpoint
-- 8. A stored Task assignment no longer names a board or column.
UPDATE "agent_inbox"
SET "content" = ("content"::jsonb - 'board' - 'column')::text
WHERE "source" = 'task_assignment';--> statement-breakpoint
DROP FUNCTION pg_temp.legacy_task_id(text, text);--> statement-breakpoint
-- Check the deferred links now (0124's), so the table changes below run with
-- no pending trigger events.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
-- The Task foreign keys go first, so dropping the tables cascades to nothing.
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_board_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_column_fk";
--> statement-breakpoint
ALTER TABLE "board_columns" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_inbox_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "board_columns" CASCADE;--> statement-breakpoint
DROP TABLE "boards" CASCADE;--> statement-breakpoint
DROP TABLE "task_inbox_items" CASCADE;--> statement-breakpoint
DROP INDEX "tasks_board_number_key";--> statement-breakpoint
DROP INDEX "tasks_board_column_idx";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "key_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_key_number_key" ON "tasks" USING btree ("key_id","number");--> statement-breakpoint
CREATE INDEX "tasks_state_idx" ON "tasks" USING btree ("server_id","state");--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "board_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "column_id";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_at" CHECK (("tasks"."completed_at" is not null) = ("tasks"."state" in ('done', 'canceled')));--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;
