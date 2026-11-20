CREATE TABLE "drive_area_counters" (
	"area_id" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "drive_area_counters_server_id_area_id_pk" PRIMARY KEY("server_id","area_id"),
	CONSTRAINT "drive_area_counters_nonnegative" CHECK ("drive_area_counters"."counter" >= 0)
);
--> statement-breakpoint
CREATE TABLE "drive_changes" (
	"area_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"change" text NOT NULL,
	"path" text NOT NULL,
	"path_key" text NOT NULL,
	"revision_id" text,
	"sequence" bigint NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "drive_changes_server_id_area_id_path_key_pk" PRIMARY KEY("server_id","area_id","path_key"),
	CONSTRAINT "drive_changes_shape" CHECK ("drive_changes"."sequence" > 0 and ("drive_changes"."change" = 'put') = ("drive_changes"."revision_id" is not null) and "drive_changes"."change" in ('put', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "drive_push_outcomes" (
	"author_key" text NOT NULL,
	"base_revision_id" text,
	"content_sha256" text,
	"content_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"operation" text NOT NULL,
	"outcome" jsonb NOT NULL,
	"path_key" text NOT NULL,
	"push_id" text NOT NULL,
	"request_id" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "drive_push_outcomes_server_id_author_key_request_id_pk" PRIMARY KEY("server_id","author_key","request_id"),
	CONSTRAINT "drive_push_outcomes_request_shape" CHECK ("drive_push_outcomes"."operation" in ('put', 'delete') and ("drive_push_outcomes"."operation" = 'put') = ("drive_push_outcomes"."content_type" is not null) and ("drive_push_outcomes"."operation" = 'put' or ("drive_push_outcomes"."content_sha256" is null and "drive_push_outcomes"."base_revision_id" is not null)))
);
--> statement-breakpoint
CREATE TABLE "drive_pushes" (
	"agent_id" text NOT NULL,
	"closed_at" timestamp with time zone,
	"id" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_id" text NOT NULL,
	"task_id" text,
	CONSTRAINT "drive_pushes_server_id_id_pk" PRIMARY KEY("server_id","id")
);
--> statement-breakpoint
CREATE TABLE "message_drive_citations" (
	"artifact_id" text,
	"message_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"path" text NOT NULL,
	"revision_id" text,
	"server_id" text NOT NULL,
	CONSTRAINT "message_drive_citations_server_id_message_id_ordinal_pk" PRIMARY KEY("server_id","message_id","ordinal"),
	CONSTRAINT "message_drive_citations_shape" CHECK ("message_drive_citations"."ordinal" >= 0 and ("message_drive_citations"."artifact_id" is null) = ("message_drive_citations"."revision_id" is null))
);
--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_chat";--> statement-breakpoint
ALTER TABLE "agent_run_triggers" DROP CONSTRAINT "agent_run_triggers_chat";--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD COLUMN "base_revision_id" text;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD COLUMN "parent_revision_id" text;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD COLUMN "request_sha256" text;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD COLUMN "task_id" text;--> statement-breakpoint
ALTER TABLE "drive_area_counters" ADD CONSTRAINT "drive_area_counters_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_changes" ADD CONSTRAINT "drive_changes_area_fk" FOREIGN KEY ("server_id","area_id") REFERENCES "public"."drive_area_counters"("server_id","area_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_changes" ADD CONSTRAINT "drive_changes_artifact_fk" FOREIGN KEY ("server_id","artifact_id") REFERENCES "public"."artifacts"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_push_outcomes" ADD CONSTRAINT "drive_push_outcomes_push_fk" FOREIGN KEY ("server_id","push_id") REFERENCES "public"."drive_pushes"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_pushes" ADD CONSTRAINT "drive_pushes_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_drive_citations" ADD CONSTRAINT "message_drive_citations_message_fk" FOREIGN KEY ("server_id","message_id") REFERENCES "public"."chat_messages"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drive_changes_area_sequence" ON "drive_changes" USING btree ("server_id","area_id","sequence");--> statement-breakpoint
CREATE INDEX "drive_push_outcomes_push" ON "drive_push_outcomes" USING btree ("server_id","push_id");--> statement-breakpoint
CREATE INDEX "drive_pushes_open" ON "drive_pushes" USING btree ("server_id","agent_id") WHERE "drive_pushes"."closed_at" is null;--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_chat" CHECK ("agent_inbox"."source" = 'task_assignment'
                or ("agent_inbox"."chat_id" is null) = ("agent_inbox"."source" in ('subagent', 'drive_conflict')));--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat" CHECK ("agent_run_triggers"."source" = 'task_assignment'
                or ("agent_run_triggers"."chat_id" is null) = ("agent_run_triggers"."source" in ('subagent', 'drive_conflict')));--> statement-breakpoint
-- specs/artifact-drive.md "Migration": every existing path moves into the Haus area,
-- rewriting paths only, and the Haus counter starts at the number of its files.
-- The live-path unique index is checked per row, so `a.md` cannot become `haus/a.md` while
-- `haus/a.md` is still live. Keys pass through `/<key>` first: no valid path starts with `/`.
UPDATE "artifacts" SET "path_key" = '/' || "path_key";
--> statement-breakpoint
UPDATE "artifacts" SET "path" = 'haus/' || "path", "path_key" = 'haus/' || substr("path_key", 2);
--> statement-breakpoint
INSERT INTO "drive_area_counters" ("server_id", "area_id", "counter")
SELECT "servers"."id", 'haus', count("artifacts"."id")
FROM "servers"
LEFT JOIN "artifacts" ON "artifacts"."server_id" = "servers"."id"
    AND "artifacts"."deleted_at" IS NULL
    AND "artifacts"."current_revision_id" IS NOT NULL
GROUP BY "servers"."id";
--> statement-breakpoint
INSERT INTO "drive_changes" ("server_id", "area_id", "path_key", "path", "sequence", "change", "artifact_id", "revision_id")
SELECT "server_id", 'haus', "path_key", "path",
    row_number() OVER (PARTITION BY "server_id" ORDER BY "path_key", "id"),
    'put', "id", "current_revision_id"
FROM "artifacts"
WHERE "deleted_at" IS NULL AND "current_revision_id" IS NOT NULL;
