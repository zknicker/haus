-- ADR 0055 and specs/projects.md, migration steps 1 and 2: every live or
-- archived channel becomes a Project with exactly one key. `#all` becomes the
-- Haus project, named `haus`, after any other channel already named `haus` moves
-- to the next free `haus-<n>`. Where channels shared a key, the Haus project
-- keeps it, else the channel with the most Tasks under it, else the oldest; every
-- other channel gets a new entry by the key rule. Tasks keep their keys and
-- numbers. Each step is a no-op when it already ran, and minted entry ids derive
-- from the channel id, so a replay converges on the same rows.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
CREATE OR REPLACE FUNCTION pg_temp.project_entry_id(seed text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT 'tky_' || translate(
        encode(substring(sha256(convert_to(seed, 'UTF8')) FROM 1 FOR 12), 'base64'),
        '+/', '-_'
    )
$$;--> statement-breakpoint
-- The key rule (specs/projects.md, "Allocating a key"); the Server's
-- `allocateProjectKey` follows the same steps.
CREATE OR REPLACE FUNCTION pg_temp.allocate_project_key(target_server text, channel_name text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
    characters text := upper(regexp_replace(channel_name, '[^A-Za-z0-9]', '', 'g'));
    base text;
    candidate text;
    n integer := 2;
BEGIN
    IF characters = '' THEN
        LOOP
            candidate := 'P' || n;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM "task_keys" WHERE "server_id" = target_server AND "key" = candidate
            );
            n := n + 1;
        END LOOP;
        RETURN candidate;
    END IF;
    IF characters ~ '^[0-9]' THEN
        characters := 'P' || characters;
    END IF;
    base := CASE WHEN length(characters) < 2 THEN rpad(characters, 2, 'X') ELSE left(characters, 4) END;
    candidate := base;
    WHILE EXISTS (
        SELECT 1 FROM "task_keys" WHERE "server_id" = target_server AND "key" = candidate
    ) LOOP
        candidate := left(base, 5 - length(n::text)) || n;
        n := n + 1;
    END LOOP;
    RETURN candidate;
END $$;--> statement-breakpoint
-- 1. The name `haus` is the Haus project's. Channel names are unique per
-- Server across deleted rows too, so the free suffix checks every row.
DO $$
DECLARE
    taken record;
    free_name text;
    n integer;
BEGIN
    FOR taken IN
        SELECT "id", "server_id" FROM "chats"
        WHERE "kind" = 'channel' AND "name" = 'haus' AND NOT "is_all"
        ORDER BY "server_id", "id"
    LOOP
        n := 2;
        LOOP
            free_name := 'haus-' || n;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM "chats"
                WHERE "server_id" = taken."server_id" AND "kind" = 'channel' AND "name" = free_name
            );
            n := n + 1;
        END LOOP;
        UPDATE "chats" SET "name" = free_name WHERE "id" = taken."id";
        RAISE NOTICE 'channels are projects: Server % renamed channel % from haus to %',
            taken."server_id", taken."id", free_name;
    END LOOP;
END $$;--> statement-breakpoint
-- 0130 drops `anchor_message_id` and writes the final shape, which keeps the
-- Haus name clause, so a replay after it leaves the shape alone.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'chats'::regclass AND attname = 'anchor_message_id' AND NOT attisdropped
    ) THEN
        RETURN;
    END IF;
    ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_shape";
    UPDATE "chats" SET "name" = 'haus' WHERE "is_all" AND "name" <> 'haus';
    ALTER TABLE "chats" ADD CONSTRAINT "chats_shape" CHECK ((
                (
                    "chats"."kind" = 'channel'
                    and "chats"."name" is not null
                    and "chats"."dm_agent_id" is null
                    and "chats"."dm_member_one_stint" is null
                    and "chats"."dm_member_one_user_id" is null
                    and "chats"."dm_member_two_stint" is null
                    and "chats"."dm_member_two_user_id" is null
                    and "chats"."parent_chat_id" is null
                    and "chats"."parent_chat_kind" is null
                    and "chats"."anchor_message_id" is null
                    and (not "chats"."is_all" or "chats"."name" = 'haus')
                )
                or (
                    "chats"."kind" = 'dm'
                    and "chats"."name" is null
                    and "chats"."color" is null
                    and "chats"."icon" is null
                    and "chats"."is_all" = false
                    and "chats"."dm_member_one_stint" is not null
                    and "chats"."dm_member_one_user_id" is not null
                    and "chats"."parent_chat_id" is null
                    and "chats"."parent_chat_kind" is null
                    and "chats"."anchor_message_id" is null
                    and (
                        (
                            "chats"."dm_agent_id" is null
                            and "chats"."dm_member_two_stint" is not null
                            and "chats"."dm_member_two_user_id" is not null
                            and "chats"."dm_member_one_user_id" collate "C" < "chats"."dm_member_two_user_id" collate "C"
                        )
                        or (
                            "chats"."dm_agent_id" is not null
                            and "chats"."dm_member_two_stint" is null
                            and "chats"."dm_member_two_user_id" is null
                        )
                    )
                )
                or (
                    "chats"."kind" = 'task'
                    and "chats"."name" is null
                    and "chats"."color" is null
                    and "chats"."icon" is null
                    and "chats"."is_all" = false
                    and "chats"."dm_agent_id" is null
                    and "chats"."dm_member_one_stint" is null
                    and "chats"."dm_member_one_user_id" is null
                    and "chats"."dm_member_two_stint" is null
                    and "chats"."dm_member_two_user_id" is null
                    and "chats"."parent_chat_id" is not null
                    and "chats"."parent_chat_kind" = 'channel'
                    and "chats"."anchor_message_id" is not null
                )
            ));
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"chat_kind" text DEFAULT 'channel' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_id" text NOT NULL,
	"task_key_id" text NOT NULL,
	CONSTRAINT "projects_server_id_chat_id_key" UNIQUE("server_id","chat_id"),
	CONSTRAINT "projects_task_key_id_key" UNIQUE("task_key_id"),
	CONSTRAINT "projects_chat_kind" CHECK ("projects"."chat_kind" = 'channel'),
	CONSTRAINT "projects_chat_fk" FOREIGN KEY ("server_id","chat_id","chat_kind") REFERENCES "public"."chats"("server_id","id","kind") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "projects_task_key_fk" FOREIGN KEY ("server_id","task_key_id") REFERENCES "public"."task_keys"("server_id","id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint
-- 2. Keys. A channel with no key of its own numbered its Tasks under the
-- Server's General entry (`resolveChannelTaskKeyId`), so that entry is its key
-- here. Soft-deleted channels get no Project; their entries stay reserved.
DO $$
DECLARE
    claim record;
    entry_key text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'chats'::regclass AND attname = 'task_key_id' AND NOT attisdropped
    ) THEN
        RETURN;
    END IF;
    CREATE TEMP TABLE "project_key_claims" ON COMMIT DROP AS
    SELECT
        channel."server_id",
        channel."id" AS "chat_id",
        channel."name",
        channel."is_all",
        channel."created_at",
        coalesce(channel."task_key_id", general."id") AS "task_key_id",
        (
            SELECT count(*) FROM "tasks" task
            JOIN "chats" task_chat
                ON task_chat."server_id" = task."server_id" AND task_chat."id" = task."chat_id"
            WHERE task."server_id" = channel."server_id"
                AND task."key_id" = coalesce(channel."task_key_id", general."id")
                AND task_chat."parent_chat_id" = channel."id"
        ) AS "task_count"
    FROM "chats" channel
    LEFT JOIN LATERAL (
        SELECT entry."id" FROM "task_keys" entry
        WHERE entry."server_id" = channel."server_id"
        ORDER BY (entry."key" = 'GEN') DESC, entry."created_at", entry."id"
        LIMIT 1
    ) general ON true
    WHERE channel."kind" = 'channel'
        AND channel."deleted_at" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "projects" project WHERE project."chat_id" = channel."id");

    INSERT INTO "projects" ("chat_id", "server_id", "task_key_id", "created_at")
    SELECT DISTINCT ON (keeper."task_key_id")
        keeper."chat_id", keeper."server_id", keeper."task_key_id", keeper."created_at"
    FROM "project_key_claims" keeper
    WHERE keeper."task_key_id" IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM "projects" project WHERE project."task_key_id" = keeper."task_key_id"
        )
    ORDER BY keeper."task_key_id", keeper."is_all" DESC, keeper."task_count" DESC,
        keeper."created_at", keeper."chat_id";

    FOR claim IN
        SELECT * FROM "project_key_claims" unclaimed
        WHERE NOT EXISTS (
            SELECT 1 FROM "projects" project WHERE project."chat_id" = unclaimed."chat_id"
        )
        ORDER BY unclaimed."server_id", unclaimed."created_at", unclaimed."chat_id"
    LOOP
        entry_key := pg_temp.allocate_project_key(claim."server_id", claim."name");
        INSERT INTO "task_keys" ("id", "server_id", "key")
        VALUES (pg_temp.project_entry_id('project-key:' || claim."chat_id"), claim."server_id", entry_key);
        INSERT INTO "projects" ("chat_id", "server_id", "task_key_id", "created_at")
        VALUES (
            claim."chat_id",
            claim."server_id",
            pg_temp.project_entry_id('project-key:' || claim."chat_id"),
            claim."created_at"
        );
        RAISE NOTICE 'channels are projects: Server % channel #% takes the new key %',
            claim."server_id", claim."name", entry_key;
    END LOOP;
END $$;--> statement-breakpoint
-- `projects.task_key_id` is now the one key.
ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_task_key_shape";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_task_key_fk";--> statement-breakpoint
ALTER TABLE "chats" DROP COLUMN IF EXISTS "task_key_id";--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;
