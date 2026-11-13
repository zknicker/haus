-- ADR 0051: Tasks are standalone records on boards with categorized columns.
-- Tasks reference Messages and Reminders by link rows, a person's assignments
-- are Task Inbox items, and an Agent's arrive as a chatless `task_assignment`.
CREATE TABLE "board_columns" (
	"board_id" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "board_columns_board_id_key" UNIQUE("server_id","board_id","id"),
	CONSTRAINT "board_columns_category" CHECK ("board_columns"."category" in ('backlog', 'todo', 'active', 'done', 'canceled')),
	CONSTRAINT "board_columns_name_length" CHECK (char_length("board_columns"."name") between 1 and 40),
	CONSTRAINT "board_columns_position" CHECK ("board_columns"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_agent_id" text,
	"created_by_user_id" text,
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"server_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "boards_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "boards_key_format" CHECK ("boards"."key" ~ '^[A-Z][A-Z0-9]{1,4}$'),
	CONSTRAINT "boards_name_length" CHECK (char_length("boards"."name") between 1 and 60),
	CONSTRAINT "boards_creator_shape" CHECK (num_nonnulls("boards"."created_by_user_id", "boards"."created_by_agent_id") <= 1),
	CONSTRAINT "boards_next_number" CHECK ("boards"."next_number" >= 1),
	CONSTRAINT "boards_positive_version" CHECK ("boards"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_inbox_items" (
	"assigned_by_agent_id" text,
	"assigned_by_user_id" text,
	"assignment_version" integer NOT NULL,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_id" text NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "task_inbox_items_user_id_task_id_pk" PRIMARY KEY("user_id","task_id"),
	CONSTRAINT "task_inbox_items_assigner_shape" CHECK (num_nonnulls("task_inbox_items"."assigned_by_user_id", "task_inbox_items"."assigned_by_agent_id") = 1),
	CONSTRAINT "task_inbox_items_assignment_version" CHECK ("task_inbox_items"."assignment_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "task_message_links" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"server_id" text NOT NULL,
	"task_id" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "task_message_links_message_id_task_id_ordinal_pk" PRIMARY KEY("message_id","task_id","ordinal"),
	CONSTRAINT "task_message_links_ordinal" CHECK ("task_message_links"."ordinal" >= 0),
	CONSTRAINT "task_message_links_text_length" CHECK (char_length("task_message_links"."text") between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "task_reminder_links" (
	"reminder_id" text NOT NULL,
	"server_id" text NOT NULL,
	"task_id" text NOT NULL,
	CONSTRAINT "task_reminder_links_reminder_id_task_id_pk" PRIMARY KEY("reminder_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "task_label_assignments" (
	"label_id" text NOT NULL,
	"server_id" text NOT NULL,
	"task_id" text NOT NULL,
	CONSTRAINT "task_label_assignments_task_id_label_id_pk" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"assignee_agent_id" text,
	"assignee_user_id" text,
	"board_id" text NOT NULL,
	"column_id" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_agent_id" text,
	"created_by_user_id" text,
	"description" text DEFAULT '' NOT NULL,
	"due_on" date,
	"id" text PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"server_id" text NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tasks_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "tasks_assignee_shape" CHECK (num_nonnulls("tasks"."assignee_user_id", "tasks"."assignee_agent_id") <= 1),
	CONSTRAINT "tasks_creator_shape" CHECK (num_nonnulls("tasks"."created_by_user_id", "tasks"."created_by_agent_id") = 1),
	CONSTRAINT "tasks_priority" CHECK ("tasks"."priority" in ('none', 'urgent', 'high', 'medium', 'low')),
	CONSTRAINT "tasks_title_length" CHECK (char_length("tasks"."title") between 1 and 200),
	CONSTRAINT "tasks_description_length" CHECK (char_length("tasks"."description") <= 20000),
	CONSTRAINT "tasks_positive_number" CHECK ("tasks"."number" > 0),
	CONSTRAINT "tasks_positive_version" CHECK ("tasks"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_chat";--> statement-breakpoint
ALTER TABLE "agent_run_triggers" DROP CONSTRAINT "agent_run_triggers_chat";--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_board_fk" FOREIGN KEY ("server_id","board_id") REFERENCES "public"."boards"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_creator_membership_fk" FOREIGN KEY ("server_id","created_by_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_creator_agent_fk" FOREIGN KEY ("server_id","created_by_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_inbox_items" ADD CONSTRAINT "task_inbox_items_task_fk" FOREIGN KEY ("server_id","task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_inbox_items" ADD CONSTRAINT "task_inbox_items_membership_fk" FOREIGN KEY ("server_id","user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_inbox_items" ADD CONSTRAINT "task_inbox_items_assigner_membership_fk" FOREIGN KEY ("server_id","assigned_by_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_inbox_items" ADD CONSTRAINT "task_inbox_items_assigner_agent_fk" FOREIGN KEY ("server_id","assigned_by_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_message_links" ADD CONSTRAINT "task_message_links_message_fk" FOREIGN KEY ("server_id","message_id") REFERENCES "public"."chat_messages"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_message_links" ADD CONSTRAINT "task_message_links_task_fk" FOREIGN KEY ("server_id","task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminder_links" ADD CONSTRAINT "task_reminder_links_reminder_fk" FOREIGN KEY ("server_id","reminder_id") REFERENCES "public"."reminders"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminder_links" ADD CONSTRAINT "task_reminder_links_task_fk" FOREIGN KEY ("server_id","task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label_assignments" ADD CONSTRAINT "task_label_assignments_task_fk" FOREIGN KEY ("server_id","task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_label_assignments" ADD CONSTRAINT "task_label_assignments_label_fk" FOREIGN KEY ("server_id","label_id") REFERENCES "public"."task_labels"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_fk" FOREIGN KEY ("server_id","board_id") REFERENCES "public"."boards"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_column_fk" FOREIGN KEY ("server_id","board_id","column_id") REFERENCES "public"."board_columns"("server_id","board_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_membership_fk" FOREIGN KEY ("server_id","assignee_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_agent_fk" FOREIGN KEY ("server_id","assignee_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_membership_fk" FOREIGN KEY ("server_id","created_by_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creator_agent_fk" FOREIGN KEY ("server_id","created_by_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_columns_board_position_idx" ON "board_columns" USING btree ("board_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_server_key_key" ON "boards" USING btree ("server_id","key");--> statement-breakpoint
CREATE INDEX "task_inbox_items_uncleared_idx" ON "task_inbox_items" USING btree ("server_id","user_id") WHERE "task_inbox_items"."cleared_at" is null;--> statement-breakpoint
CREATE INDEX "task_message_links_task_idx" ON "task_message_links" USING btree ("task_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "task_reminder_links_task_idx" ON "task_reminder_links" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_board_number_key" ON "tasks" USING btree ("board_id","number");--> statement-breakpoint
CREATE INDEX "tasks_board_column_idx" ON "tasks" USING btree ("server_id","board_id","column_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_user_idx" ON "tasks" USING btree ("server_id","assignee_user_id") WHERE "tasks"."assignee_user_id" is not null;--> statement-breakpoint
CREATE INDEX "tasks_assignee_agent_idx" ON "tasks" USING btree ("server_id","assignee_agent_id") WHERE "tasks"."assignee_agent_id" is not null;--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_chat" CHECK (("agent_inbox"."chat_id" is null) = ("agent_inbox"."source" in ('dream', 'heartbeat', 'heartbeat_report', 'subagent', 'task_assignment')));--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat" CHECK (("agent_run_triggers"."chat_id" is null) = ("agent_run_triggers"."source" in ('dream', 'heartbeat', 'heartbeat_report', 'subagent', 'task_assignment')));--> statement-breakpoint
-- Server purge cascades through these tables together, so every internal link
-- that does not cascade itself is checked at commit (0002's rule).
ALTER TABLE "boards" ALTER CONSTRAINT "boards_creator_membership_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "boards" ALTER CONSTRAINT "boards_creator_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "task_inbox_items" ALTER CONSTRAINT "task_inbox_items_assigner_membership_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "task_inbox_items" ALTER CONSTRAINT "task_inbox_items_assigner_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_column_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_assignee_membership_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_assignee_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_creator_membership_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_creator_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- Task limits count UTF-16 units on read, and Postgres counts code points, so a
-- migrated value full of astral characters could pass here and fail every read
-- of its board. Past the limit it falls back to half as many code points.
CREATE FUNCTION pg_temp.utf16_left(value text, units integer) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN char_length(left(value, units))
            + char_length(regexp_replace(left(value, units), '[^\U00010000-\U0010FFFF]', '', 'g')) <= units
        THEN left(value, units)
        ELSE left(value, units / 2)
    END
$$;--> statement-breakpoint
-- Every Server keeps a General board (key GEN) with the five default columns.
-- Opaque ids follow `createOpaqueId`: a prefix and 12 random bytes in base64url.
INSERT INTO "boards" ("id", "server_id", "key", "name")
SELECT
    'brd_' || translate(encode(substring(uuid_send(gen_random_uuid()) from 1 for 12), 'base64'), '+/', '-_'),
    "servers"."id",
    'GEN',
    'General'
FROM "servers";--> statement-breakpoint
INSERT INTO "board_columns" ("id", "server_id", "board_id", "name", "category", "position")
SELECT
    'col_' || translate(encode(substring(uuid_send(gen_random_uuid()) from 1 for 12), 'base64'), '+/', '-_'),
    "boards"."server_id",
    "boards"."id",
    defaults."name",
    defaults."category",
    defaults."position"
FROM "boards"
CROSS JOIN (VALUES
    ('Backlog', 'backlog', 0),
    ('Todo', 'todo', 1),
    ('In progress', 'active', 2),
    ('Done', 'done', 3),
    ('Canceled', 'canceled', 4)
) AS defaults ("name", "category", "position")
WHERE "boards"."key" = 'GEN';--> statement-breakpoint
-- Human-composed and converted claims were backlog items all along (ADR 0051
-- decision 9): each becomes a GEN Task. Agent claims (`claimed`) stay claims.
CREATE TEMPORARY TABLE "migrated_claims" AS
SELECT
    'tsk_' || translate(encode(substring(uuid_send(gen_random_uuid()) from 1 for 12), 'base64'), '+/', '-_') AS "task_id",
    "message_claims"."server_id",
    "message_claims"."message_id",
    "message_claims"."status",
    "message_claims"."priority",
    "message_claims"."assignee_agent_id",
    "message_claims"."created_by_user_id",
    "message_claims"."created_by_agent_id",
    "message_claims"."created_at",
    "message_claims"."updated_at",
    "chat_messages"."content",
    row_number() OVER (
        PARTITION BY "message_claims"."server_id"
        ORDER BY "message_claims"."created_at", "message_claims"."message_id"
    )::integer AS "number",
    coalesce(
        nullif(btrim(pg_temp.utf16_left(btrim((
            SELECT lines."line"
            FROM regexp_split_to_table("chat_messages"."content", E'\n') WITH ORDINALITY AS lines ("line", "position")
            WHERE btrim(lines."line", E' \t\r') <> ''
            ORDER BY lines."position"
            LIMIT 1
        ), E' \t\r'), 200)), ''),
        'Untitled task'
    ) AS "title"
FROM "message_claims"
JOIN "chat_messages"
    ON "chat_messages"."server_id" = "message_claims"."server_id"
    AND "chat_messages"."id" = "message_claims"."message_id"
WHERE "message_claims"."origin" IN ('composed', 'converted');--> statement-breakpoint
INSERT INTO "tasks" (
    "id", "server_id", "board_id", "number", "title", "description", "column_id",
    "assignee_agent_id", "priority", "created_by_user_id", "created_by_agent_id",
    "created_at", "updated_at", "completed_at"
)
SELECT
    claims."task_id",
    claims."server_id",
    "boards"."id",
    claims."number",
    claims."title",
    pg_temp.utf16_left(claims."content", 20000),
    "board_columns"."id",
    claims."assignee_agent_id",
    claims."priority",
    claims."created_by_user_id",
    claims."created_by_agent_id",
    claims."created_at",
    claims."updated_at",
    CASE WHEN claims."status" IN ('done', 'closed') THEN claims."updated_at" END
FROM "migrated_claims" AS claims
JOIN "boards"
    ON "boards"."server_id" = claims."server_id"
    AND "boards"."key" = 'GEN'
JOIN "board_columns"
    ON "board_columns"."board_id" = "boards"."id"
    AND "board_columns"."category" = CASE claims."status"
        WHEN 'todo' THEN 'todo'
        WHEN 'in_progress' THEN 'active'
        WHEN 'in_review' THEN 'active'
        WHEN 'done' THEN 'done'
        ELSE 'canceled'
    END;--> statement-breakpoint
INSERT INTO "task_label_assignments" ("server_id", "task_id", "label_id")
SELECT claims."server_id", claims."task_id", "message_claim_labels"."label_id"
FROM "migrated_claims" AS claims
JOIN "message_claim_labels"
    ON "message_claim_labels"."server_id" = claims."server_id"
    AND "message_claim_labels"."message_id" = claims."message_id";--> statement-breakpoint
-- The source message shows in the Task's Mentioned in. Its link text is the
-- key, since the message itself never named the Task.
INSERT INTO "task_message_links" ("server_id", "message_id", "task_id", "ordinal", "text", "created_at")
SELECT claims."server_id", claims."message_id", claims."task_id", 0, 'GEN-' || claims."number", claims."created_at"
FROM "migrated_claims" AS claims;--> statement-breakpoint
-- A queued assignment for a claim that is now an open Task carries on as that
-- Task's assignment, so its Agent keeps the pending wake. Only the Agent the claim
-- still names gets one, and the Task's version 1 is its assignment version.
INSERT INTO "agent_inbox" (
    "id", "server_id", "agent_id", "chat_id", "content", "created_at", "dedupe_key", "mentioned", "source"
)
SELECT DISTINCT ON (claims."task_id")
    'inb_' || translate(encode(substring(uuid_send(gen_random_uuid()) from 1 for 12), 'base64'), '+/', '-_'),
    item."server_id",
    item."agent_id",
    NULL,
    jsonb_build_object(
        'assignedBy', (regexp_match(item."content", '^\[Haus claim assignment [^\]]*assignedBy=@([a-z0-9-]+)\]'))[1],
        'assignedByAgent', false,
        'board', "boards"."name",
        'column', "board_columns"."name",
        'id', 'task-assign:' || claims."task_id" || ':1',
        'key', 'GEN-' || claims."number",
        'priority', claims."priority",
        'taskId', claims."task_id",
        'title', claims."title"
    )::text,
    item."created_at",
    'task-assign:' || claims."task_id" || ':1',
    true,
    'task_assignment'
FROM "migrated_claims" AS claims
JOIN "agent_inbox" AS item
    ON item."server_id" = claims."server_id"
    AND item."agent_id" = claims."assignee_agent_id"
    AND item."source" = 'claim_assignment'
    AND item."state" = 'queued'
    AND item."run_id" IS NULL
    AND split_part(item."dedupe_key", ':', 2) = claims."message_id"
JOIN "tasks" ON "tasks"."id" = claims."task_id"
JOIN "boards" ON "boards"."id" = "tasks"."board_id"
JOIN "board_columns" ON "board_columns"."id" = "tasks"."column_id"
WHERE claims."status" NOT IN ('done', 'closed')
ORDER BY claims."task_id", item."created_at" DESC;--> statement-breakpoint
-- Every queued assignment of a migrated claim names a claim that no longer exists.
-- A row a run already holds settles with that run, or retires if the run fails.
DELETE FROM "agent_inbox"
USING "migrated_claims" AS claims
WHERE "agent_inbox"."server_id" = claims."server_id"
    AND "agent_inbox"."source" = 'claim_assignment'
    AND "agent_inbox"."state" = 'queued'
    AND "agent_inbox"."run_id" IS NULL
    AND split_part("agent_inbox"."dedupe_key", ':', 2) = claims."message_id";--> statement-breakpoint
DELETE FROM "message_claim_labels"
USING "migrated_claims" AS claims
WHERE "message_claim_labels"."server_id" = claims."server_id"
    AND "message_claim_labels"."message_id" = claims."message_id";--> statement-breakpoint
DELETE FROM "message_claims"
USING "migrated_claims" AS claims
WHERE "message_claims"."server_id" = claims."server_id"
    AND "message_claims"."message_id" = claims."message_id";--> statement-breakpoint
UPDATE "boards"
SET "next_number" = numbered."last_number" + 1
FROM (
    SELECT "board_id", max("number") AS "last_number"
    FROM "tasks"
    GROUP BY "board_id"
) AS numbered
WHERE "boards"."id" = numbered."board_id";--> statement-breakpoint
DROP TABLE "migrated_claims";--> statement-breakpoint
-- Check the deferred links now, so a later migration in this batch can alter
-- these tables without pending trigger events.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;