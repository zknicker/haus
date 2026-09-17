ALTER TABLE "chat_messages" ADD COLUMN "reply_to_message_id" text;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "reply_root_message_id" text;
--> statement-breakpoint
UPDATE "chat_messages"
SET "reply_root_message_id" = "id"
WHERE "reply_root_message_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_reply_parent_fk"
    FOREIGN KEY ("server_id", "chat_id", "reply_to_message_id")
    REFERENCES "chat_messages" ("server_id", "chat_id", "id")
    ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_reply_root_fk"
    FOREIGN KEY ("server_id", "chat_id", "reply_root_message_id")
    REFERENCES "chat_messages" ("server_id", "chat_id", "id")
    ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_reply_shape"
    CHECK (
        ("reply_to_message_id" IS NULL AND ("reply_root_message_id" IS NULL OR "reply_root_message_id" = "id"))
        OR ("reply_to_message_id" IS NOT NULL AND "reply_root_message_id" IS NOT NULL)
    );
--> statement-breakpoint
CREATE INDEX "chat_messages_reply_root_idx"
    ON "chat_messages" ("server_id", "chat_id", "reply_root_message_id", "sequence");
--> statement-breakpoint
ALTER TABLE "agent_message_drafts" ADD COLUMN "reply_to_message_id" text;
--> statement-breakpoint
ALTER TABLE "agent_message_drafts"
    ADD CONSTRAINT "agent_message_drafts_reply_parent_fk"
    FOREIGN KEY ("server_id", "chat_id", "reply_to_message_id")
    REFERENCES "chat_messages" ("server_id", "chat_id", "id")
    ON DELETE CASCADE;
--> statement-breakpoint
CREATE TABLE "agent_message_follows" (
    "agent_id" text NOT NULL,
    "chat_id" text NOT NULL,
    "chat_kind" text DEFAULT 'channel' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "followed" boolean DEFAULT true NOT NULL,
    "root_message_id" text NOT NULL,
    "server_id" text NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "agent_message_follows_pk" PRIMARY KEY("server_id", "chat_id", "root_message_id", "agent_id"),
    CONSTRAINT "agent_message_follows_agent_fk" FOREIGN KEY ("server_id", "agent_id") REFERENCES "agents" ("server_id", "id") ON DELETE CASCADE,
    CONSTRAINT "agent_message_follows_chat_fk" FOREIGN KEY ("server_id", "chat_id", "chat_kind") REFERENCES "chats" ("server_id", "id", "kind") ON DELETE CASCADE,
    CONSTRAINT "agent_message_follows_root_message_fk" FOREIGN KEY ("server_id", "chat_id", "root_message_id") REFERENCES "chat_messages" ("server_id", "chat_id", "id") ON DELETE CASCADE,
    CONSTRAINT "agent_message_follows_chat_kind" CHECK ("chat_kind" IN ('channel', 'dm'))
);
--> statement-breakpoint
CREATE INDEX "agent_message_follows_root_idx"
    ON "agent_message_follows" ("server_id", "chat_id", "root_message_id", "followed");
