-- ADR 0044: Cloud Agent work is referenced, not embedded. Messages link to the
-- work; every launch Message becomes an ordinary text Message that links its
-- work, and the work's Chat and launch Message stay as historical pointers
-- with no foreign key, so losing either keeps the work.
-- Deferred foreign-key checks would otherwise leave trigger events pending
-- on tables this migration then alters.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
CREATE TABLE "cloud_agent_work_links" (
	"chat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"server_id" text NOT NULL,
	"work_id" text NOT NULL,
	CONSTRAINT "cloud_agent_work_links_pkey" PRIMARY KEY("server_id","message_id","work_id"),
	CONSTRAINT "cloud_agent_work_links_ordinal" CHECK ("cloud_agent_work_links"."ordinal" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_message_key";--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_chat_fk";
--> statement-breakpoint
ALTER TABLE "cloud_agent_work" DROP CONSTRAINT "cloud_agent_work_message_fk";
--> statement-breakpoint
ALTER TABLE "cloud_agent_work" RENAME COLUMN "message_id" TO "launch_message_id";--> statement-breakpoint
ALTER TABLE "cloud_agent_work_links" ADD CONSTRAINT "cloud_agent_work_links_work_fk" FOREIGN KEY ("server_id","work_id") REFERENCES "public"."cloud_agent_work"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloud_agent_work_links" ADD CONSTRAINT "cloud_agent_work_links_message_fk" FOREIGN KEY ("server_id","chat_id","message_id") REFERENCES "public"."chat_messages"("server_id","chat_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The launch Message is the work's first link. The dropped foreign key held it
-- in the work's own Chat, so the join keeps every work.
INSERT INTO "cloud_agent_work_links" ("server_id", "work_id", "chat_id", "message_id", "ordinal", "created_at")
SELECT work."server_id", work."id", work."chat_id", work."launch_message_id", 0, message."created_at"
FROM "cloud_agent_work" AS work
JOIN "chat_messages" AS message
    ON message."server_id" = work."server_id"
    AND message."chat_id" = work."chat_id"
    AND message."id" = work."launch_message_id";--> statement-breakpoint
-- Mirrors `formatCloudAgentWorkLink` (packages/haus-api): line breaks become
-- spaces, `]` drops, the label trims, an empty label falls back, then `\` and
-- `[` are escaped. Work ids match `caw_[A-Za-z0-9_-]{16}`, so the target needs
-- no percent-encoding. Identity, sequence, timestamps, reads, and inbox rows
-- stay untouched; `search_vector` regenerates from the new content.
UPDATE "chat_messages" AS message
SET "body_kind" = 'text',
    "content" = message."content" || E'\n\n[' || link."label" || '](cloud-agent://' || link."work_id" || ')'
FROM (
    SELECT work."server_id", work."launch_message_id", work."id" AS "work_id",
        replace(replace(
            coalesce(nullif(regexp_replace(
                left(regexp_replace(replace(regexp_replace(work."title", '[\r\n]+', ' ', 'g'), ']', ''), '^\s+|\s+$', '', 'g'), 120),
                '^\s+|\s+$', '', 'g'
            ), ''), 'Cloud Agent work'),
            '\', '\\'), '[', '\[') AS "label"
    FROM "cloud_agent_work" AS work
) AS link
WHERE message."server_id" = link."server_id"
    AND message."id" = link."launch_message_id"
    AND message."body_kind" = 'cloud-agent-work';--> statement-breakpoint
CREATE INDEX "cloud_agent_work_links_work_idx" ON "cloud_agent_work_links" USING btree ("server_id","work_id","created_at" DESC NULLS LAST,"message_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "cloud_agent_work_links_chat_idx" ON "cloud_agent_work_links" USING btree ("server_id","chat_id");--> statement-breakpoint
CREATE INDEX "cloud_agent_work_launch_message_idx" ON "cloud_agent_work" USING btree ("server_id","launch_message_id");
