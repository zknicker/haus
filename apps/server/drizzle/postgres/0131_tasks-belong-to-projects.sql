-- ADR 0055 and specs/projects.md, migration step 3: every Task belongs to one
-- Project, and its origin moves from the Task Chat onto the Task. A Task Chat's
-- parent channel is its Project; a chatless Task takes the Project holding its
-- key, else the Haus project. Every Agent's home is the Haus project until J3
-- recomputes homes. Each step is a no-op when it already ran.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "project_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "origin_chat_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "origin_message_id" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "home_project_id" text;--> statement-breakpoint
-- The origin pair is copied only while the Task Chat still carries it.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'chats'::regclass AND attname = 'anchor_message_id' AND NOT attisdropped
    ) THEN
        UPDATE "tasks" task
        SET "origin_chat_id" = task_chat."parent_chat_id",
            "origin_message_id" = task_chat."anchor_message_id"
        FROM "chats" task_chat
        WHERE task_chat."server_id" = task."server_id"
            AND task_chat."id" = task."chat_id"
            AND task."origin_chat_id" IS NULL;
    END IF;
END $$;--> statement-breakpoint
-- A Task Chat whose channel was deleted but not yet purged has no Project to
-- hang under. Its Task leaves the Chat and is canceled, as the purge did.
UPDATE "tasks" task
SET "chat_id" = NULL,
    "state" = CASE WHEN task."state" IN ('done', 'canceled') THEN task."state" ELSE 'canceled' END,
    "completed_at" = coalesce(task."completed_at", now()),
    "updated_at" = now(),
    "version" = task."version" + 1
FROM "chats" task_chat
WHERE task_chat."server_id" = task."server_id"
    AND task_chat."id" = task."chat_id"
    AND task."project_id" IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM "projects" project
        WHERE project."server_id" = task_chat."server_id"
            AND project."chat_id" = task_chat."parent_chat_id"
    );--> statement-breakpoint
UPDATE "tasks" task
SET "project_id" = task_chat."parent_chat_id"
FROM "chats" task_chat
WHERE task_chat."server_id" = task."server_id"
    AND task_chat."id" = task."chat_id"
    AND task."project_id" IS NULL;--> statement-breakpoint
UPDATE "tasks" task
SET "project_id" = coalesce(
    (
        SELECT project."chat_id" FROM "projects" project
        WHERE project."server_id" = task."server_id" AND project."task_key_id" = task."key_id"
    ),
    (
        SELECT haus."id" FROM "chats" haus
        WHERE haus."server_id" = task."server_id" AND haus."is_all"
    )
)
WHERE task."project_id" IS NULL;--> statement-breakpoint
UPDATE "agents" agent
SET "home_project_id" = haus."id"
FROM "chats" haus
WHERE haus."server_id" = agent."server_id"
    AND haus."is_all"
    AND agent."home_project_id" IS NULL;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "tasks" WHERE "project_id" IS NULL) THEN
        RAISE EXCEPTION 'tasks belong to projects: a Task has no Project and its Server no Haus project';
    END IF;
    IF EXISTS (SELECT 1 FROM "agents" WHERE "home_project_id" IS NULL) THEN
        RAISE EXCEPTION 'tasks belong to projects: an Agent''s Server has no Haus project';
    END IF;
END $$;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "home_project_id" SET NOT NULL;--> statement-breakpoint
-- The origin leaves the Task Chat: its key, its column, and its shape clause.
ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_anchor_fk";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_shape";--> statement-breakpoint
ALTER TABLE "chats" DROP COLUMN IF EXISTS "anchor_message_id";--> statement-breakpoint
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
            ));--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_chat_project_fk";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT IF EXISTS "chats_server_id_parent_key";--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_server_id_parent_key" UNIQUE("server_id","id","parent_chat_id");--> statement-breakpoint
-- A Task Chat hangs under its Task's Project. Checked at commit, like
-- `tasks_chat_fk` (0124), because a Server purge cascades both sides together.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_chat_project_fk" FOREIGN KEY ("server_id","chat_id","project_id") REFERENCES "public"."chats"("server_id","id","parent_chat_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_project_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_fk" FOREIGN KEY ("server_id","project_id") REFERENCES "public"."projects"("server_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_origin_fk";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_origin_fk" FOREIGN KEY ("server_id","origin_chat_id","origin_message_id") REFERENCES "public"."chat_messages"("server_id","chat_id","id") ON DELETE set null (origin_chat_id, origin_message_id) ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_origin_shape";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_origin_shape" CHECK (("tasks"."origin_chat_id" is null) = ("tasks"."origin_message_id" is null));--> statement-breakpoint
-- NO ACTION, not RESTRICT, and checked at commit (0002's rule): a Server purge
-- cascades both sides together.
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_home_project_fk";--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_home_project_fk" FOREIGN KEY ("server_id","home_project_id") REFERENCES "public"."projects"("server_id","chat_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- Unit A's key link joins the Server cascade too, so it is checked at commit as well.
ALTER TABLE "projects" ALTER CONSTRAINT "projects_task_key_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_project_idx" ON "tasks" USING btree ("server_id","project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_origin_idx" ON "tasks" USING btree ("server_id","origin_chat_id","origin_message_id") WHERE "tasks"."origin_chat_id" is not null;--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;
