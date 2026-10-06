-- An Agent's durable read position per Chat, outliving session rotation. Every
-- current membership — joined channel, the Agent's DMs, followed Threads —
-- starts read through its Chat's last message, so the deploy does not turn an
-- Agent's whole history into unread.
CREATE TABLE "agent_chat_reads" (
	"agent_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"server_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_chat_reads_server_id_agent_id_chat_id_pk" PRIMARY KEY("server_id","agent_id","chat_id"),
	CONSTRAINT "agent_chat_reads_nonnegative" CHECK ("agent_chat_reads"."sequence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_chat_reads" ADD CONSTRAINT "agent_chat_reads_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_reads" ADD CONSTRAINT "agent_chat_reads_chat_fk" FOREIGN KEY ("server_id","chat_id") REFERENCES "public"."chats"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_events_message_created_idx" ON "chat_events" USING btree ("server_id","message_id") WHERE "chat_events"."event_type" = 'message.created';--> statement-breakpoint
INSERT INTO "agent_chat_reads" ("server_id", "agent_id", "chat_id", "sequence")
SELECT "membership"."server_id", "membership"."agent_id", "membership"."chat_id", "chats"."last_message_sequence"
FROM (
	SELECT "server_id", "agent_id", "chat_id" FROM "channel_agent_participants"
	UNION
	SELECT "server_id", "dm_agent_id", "id" FROM "chats" WHERE "kind" = 'dm' AND "dm_agent_id" IS NOT NULL
	UNION
	SELECT "server_id", "agent_id", "thread_chat_id" FROM "agent_thread_follows" WHERE "followed"
) AS "membership"
JOIN "chats" ON "chats"."server_id" = "membership"."server_id" AND "chats"."id" = "membership"."chat_id"
ON CONFLICT DO NOTHING;
