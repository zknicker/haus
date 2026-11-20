ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_shape";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_chat_fk";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_chat_not_all";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_server_id_kind_is_all_key";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_project_fk";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_home_project_shape";--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "home_project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "chat_is_all" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$
DECLARE
    everyone record;
    general_id text;
    general_name text;
    n integer;
    agent record;
    target text;
BEGIN
    FOR everyone IN
        SELECT chat."server_id", chat."id"
        FROM "chats" chat
        JOIN "projects" project
            ON project."server_id" = chat."server_id" AND project."chat_id" = chat."id"
        WHERE chat."is_all"
        ORDER BY chat."server_id"
    LOOP
        general_name := 'general';
        n := 2;
        WHILE EXISTS (
            SELECT 1 FROM "chats"
            WHERE "server_id" = everyone."server_id" AND "kind" = 'channel' AND "name" = general_name
        ) LOOP
            general_name := 'general-' || n;
            n := n + 1;
        END LOOP;
        general_id := 'cht_' || substr(md5(everyone."server_id" || everyone."id" || clock_timestamp()::text), 1, 16);
        INSERT INTO "chats" ("id", "server_id", "kind", "name", "is_all")
        VALUES (general_id, everyone."server_id", 'channel', general_name, false);
        INSERT INTO "channel_participants" ("server_id", "chat_id", "user_id")
        SELECT "server_id", general_id, "user_id"
        FROM "channel_participants"
        WHERE "server_id" = everyone."server_id" AND "chat_id" = everyone."id";
        UPDATE "projects" SET "chat_id" = general_id
        WHERE "server_id" = everyone."server_id" AND "chat_id" = everyone."id";
        UPDATE "tasks" SET "project_id" = general_id
        WHERE "server_id" = everyone."server_id" AND "project_id" = everyone."id";
        UPDATE "chats" SET "parent_chat_id" = general_id
        WHERE "server_id" = everyone."server_id" AND "kind" = 'task'
            AND "parent_chat_id" = everyone."id";
        RAISE NOTICE 'all is a chat: Server % moved its Haus project from % to #% (%)',
            everyone."server_id", everyone."id", general_name, general_id;

        FOR agent IN
            SELECT "id" FROM "agents"
            WHERE "server_id" = everyone."server_id" AND "home_project_id" = everyone."id"
                AND "retired_at" IS NULL
            ORDER BY "id"
        LOOP
            SELECT project."chat_id" INTO target
            FROM "projects" project
            JOIN "chats" home
                ON home."server_id" = project."server_id" AND home."id" = project."chat_id"
            LEFT JOIN LATERAL (
                SELECT
                    count(*) FILTER (WHERE message."created_at" > now() - interval '30 days') AS recent,
                    count(*) AS total
                FROM "chat_messages" message
                JOIN "chats" place
                    ON place."server_id" = message."server_id" AND place."id" = message."chat_id"
                WHERE message."server_id" = everyone."server_id"
                    AND message."author_agent_id" = agent."id"
                    AND CASE WHEN place."kind" = 'task' THEN place."parent_chat_id" ELSE place."id" END
                        = project."chat_id"
            ) activity ON true
            WHERE project."server_id" = everyone."server_id"
                AND NOT home."is_all"
                AND home."archived_at" IS NULL
                AND home."deleted_at" IS NULL
                AND home."name" <> 'onboarding-owner'
            ORDER BY activity.recent DESC, activity.total DESC, project."created_at", project."chat_id"
            LIMIT 1;
            IF target IS NULL THEN
                SELECT project."chat_id" INTO target
                FROM "projects" project
                JOIN "chats" home
                    ON home."server_id" = project."server_id" AND home."id" = project."chat_id"
                WHERE project."server_id" = everyone."server_id"
                    AND home."name" = 'onboarding-owner'
                    AND home."archived_at" IS NULL
                    AND home."deleted_at" IS NULL
                LIMIT 1;
            END IF;
            target := coalesce(target, general_id);
            UPDATE "agents" SET "home_project_id" = target WHERE "id" = agent."id";
            RAISE NOTICE 'all is a chat: Agent % homed in %', agent."id", target;
        END LOOP;

        UPDATE "agents" SET "home_project_id" = NULL
        WHERE "server_id" = everyone."server_id" AND "home_project_id" = everyone."id"
            AND "retired_at" IS NOT NULL;
    END LOOP;
END $$;--> statement-breakpoint
DO $$
DECLARE
    taken record;
    free_name text;
    n integer;
BEGIN
    FOR taken IN
        SELECT "id", "server_id" FROM "chats"
        WHERE "kind" = 'channel' AND "name" = 'all' AND NOT "is_all"
        ORDER BY "server_id", "id"
    LOOP
        n := 2;
        LOOP
            free_name := 'all-' || n;
            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM "chats"
                WHERE "server_id" = taken."server_id" AND "kind" = 'channel' AND "name" = free_name
            );
            n := n + 1;
        END LOOP;
        UPDATE "chats" SET "name" = free_name WHERE "id" = taken."id";
        RAISE NOTICE 'all is a chat: Server % renamed channel % from all to %',
            taken."server_id", taken."id", free_name;
    END LOOP;
END $$;--> statement-breakpoint
UPDATE "chats" SET "name" = 'all' WHERE "is_all" AND "name" <> 'all';--> statement-breakpoint
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_server_id_kind_is_all_key" UNIQUE("server_id","id","kind","is_all");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_chat_fk" FOREIGN KEY ("server_id","chat_id","chat_kind","chat_is_all") REFERENCES "public"."chats"("server_id","id","kind","is_all") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_chat_not_all" CHECK ("projects"."chat_is_all" = false);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_fk" FOREIGN KEY ("server_id","project_id") REFERENCES "public"."projects"("server_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_home_project_shape" CHECK ("agents"."home_project_id" is not null or "agents"."retired_at" is not null);--> statement-breakpoint
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
                    and (not "chats"."is_all" or "chats"."name" = 'all')
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
                )
            ));
