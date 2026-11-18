CREATE TABLE "task_keys" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "task_keys_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "task_keys_key_format" CHECK ("task_keys"."key" ~ '^[A-Z][A-Z0-9]{1,4}$'),
	CONSTRAINT "task_keys_next_number" CHECK ("task_keys"."next_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "task_pull_requests" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"number" integer NOT NULL,
	"repository" text NOT NULL,
	"server_id" text NOT NULL,
	"task_id" text NOT NULL,
	CONSTRAINT "task_pull_requests_task_id_repository_number_pk" PRIMARY KEY("task_id","repository","number"),
	CONSTRAINT "task_pull_requests_number" CHECK ("task_pull_requests"."number" > 0),
	CONSTRAINT "task_pull_requests_repository" CHECK (char_length("task_pull_requests"."repository") between 3 and 300 and "task_pull_requests"."repository" like '%/%')
);
--> statement-breakpoint
ALTER TABLE "agent_thread_follows" DROP CONSTRAINT "agent_thread_follows_kind";--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_cloud_agent_notice";--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_chat";--> statement-breakpoint
ALTER TABLE "agent_run_triggers" DROP CONSTRAINT "agent_run_triggers_chat";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_kind";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_shape";--> statement-breakpoint
ALTER TABLE "thread_follows" DROP CONSTRAINT "thread_follows_kind";--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "task_key_id" text;--> statement-breakpoint
ALTER TABLE "cloud_agent_work" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "chat_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "key_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "state" text DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_keys" ADD CONSTRAINT "task_keys_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_pull_requests" ADD CONSTRAINT "task_pull_requests_task_fk" FOREIGN KEY ("server_id","task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_keys_server_key_key" ON "task_keys" USING btree ("server_id","key");--> statement-breakpoint
CREATE INDEX "task_pull_requests_pull_idx" ON "task_pull_requests" USING btree ("server_id","repository","number");--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_task_key_fk" FOREIGN KEY ("server_id","task_key_id") REFERENCES "public"."task_keys"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_agent_work" ADD CONSTRAINT "cloud_agent_work_task_fk" FOREIGN KEY ("server_id","task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_chat_fk" FOREIGN KEY ("server_id","chat_id") REFERENCES "public"."chats"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_key_fk" FOREIGN KEY ("server_id","key_id") REFERENCES "public"."task_keys"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cloud_agent_work_task_idx" ON "cloud_agent_work" USING btree ("server_id","task_id") WHERE "cloud_agent_work"."task_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_chat_key" ON "tasks" USING btree ("chat_id");--> statement-breakpoint
ALTER TABLE "agent_thread_follows" ADD CONSTRAINT "agent_thread_follows_kind" CHECK ("agent_thread_follows"."thread_chat_kind" in ('thread', 'task'));--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_cloud_agent_notice" CHECK (("agent_inbox"."source" = 'cloud_agent_work') = ("agent_inbox"."cloud_agent_run_id" is not null)
                and ("agent_inbox"."cloud_agent_run_id" is null) = ("agent_inbox"."cloud_agent_notice" is null)
                and ("agent_inbox"."cloud_agent_notice" is null
                    or "agent_inbox"."cloud_agent_notice" in ('settled', 'stall', 'pull_request')));--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_chat" CHECK ("agent_inbox"."source" = 'task_assignment'
                or ("agent_inbox"."chat_id" is null) = ("agent_inbox"."source" in ('dream', 'heartbeat', 'heartbeat_report', 'subagent')));--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat" CHECK ("agent_run_triggers"."source" = 'task_assignment'
                or ("agent_run_triggers"."chat_id" is null) = ("agent_run_triggers"."source" in ('dream', 'heartbeat', 'heartbeat_report', 'subagent')));--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_task_key_shape" CHECK ("chats"."task_key_id" is null or "chats"."kind" = 'channel');--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_kind" CHECK ("chats"."kind" in ('channel', 'dm', 'thread', 'task'));--> statement-breakpoint
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
                    "chats"."kind" = 'thread'
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
                    and "chats"."parent_chat_kind" in ('channel', 'dm')
                    and "chats"."anchor_message_id" is not null
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
            ));--> statement-breakpoint
ALTER TABLE "thread_follows" ADD CONSTRAINT "thread_follows_kind" CHECK ("thread_follows"."thread_chat_kind" in ('thread', 'task'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_state" CHECK ("tasks"."state" in ('todo', 'open', 'done', 'canceled'));--> statement-breakpoint
-- ADR 0053: Tasks are places. Server purge cascades through these tables
-- together, so every new internal link that does not cascade itself is checked
-- at commit (0002's rule).
ALTER TABLE "chats" ALTER CONSTRAINT "chats_task_key_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "cloud_agent_work" ALTER CONSTRAINT "cloud_agent_work_task_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_chat_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_key_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- Every board becomes a key-ledger entry with the same id, key, and counter,
-- so existing Task keys and numbers carry over (decision 11).
INSERT INTO "task_keys" ("id", "server_id", "key", "next_number", "created_at")
SELECT "id", "server_id", "key", "next_number", "created_at"
FROM "boards";--> statement-breakpoint
UPDATE "tasks"
SET
    "key_id" = "tasks"."board_id",
    "state" = CASE "board_columns"."category"
        WHEN 'backlog' THEN 'todo'
        WHEN 'todo' THEN 'todo'
        WHEN 'active' THEN 'open'
        WHEN 'done' THEN 'done'
        WHEN 'canceled' THEN 'canceled'
    END
FROM "board_columns"
WHERE "board_columns"."id" = "tasks"."column_id";--> statement-breakpoint
-- Each Channel takes its Server's General board key: the board the Server
-- itself created (no creator), oldest first, preferring GEN.
UPDATE "chats"
SET "task_key_id" = general."id"
FROM (
    SELECT DISTINCT ON ("server_id") "server_id", "id"
    FROM "boards"
    WHERE "created_by_user_id" IS NULL AND "created_by_agent_id" IS NULL
    ORDER BY "server_id", ("key" = 'GEN') DESC, "created_at", "id"
) AS general
WHERE "chats"."server_id" = general."server_id"
    AND "chats"."kind" = 'channel';--> statement-breakpoint
-- Check the deferred links now, so a later migration in this batch can alter
-- these tables without pending trigger events.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;