-- ADR 0052 decisions 1 and 14: after 0124 folded every Thread into inline
-- replies, nothing Thread-shaped remains in the schema. Task follows keep their
-- rows under Task names, Open Threads closures go, and a claim's Message always
-- sits in the claim's own Chat. 0124's audit tables stay.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "chats" WHERE "kind" = 'thread') THEN
        RAISE EXCEPTION 'threads are gone: a Thread Chat remains; run 0124 first';
    END IF;
    IF EXISTS (SELECT 1 FROM "message_claims" WHERE "thread_chat_id" IS NOT NULL) THEN
        RAISE EXCEPTION 'threads are gone: a claim still names a Thread';
    END IF;
END $$;--> statement-breakpoint
DROP TABLE "thread_closures";--> statement-breakpoint
-- Chats: no Thread kind, no Thread shape, no Thread anchor key.
DROP INDEX "chats_server_thread_anchor_key";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_shape";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_kind";--> statement-breakpoint
ALTER TABLE "chats" RENAME CONSTRAINT "chats_thread_parent_fk" TO "chats_parent_fk";--> statement-breakpoint
-- The origin-Message key 0001 added outside the typed schema, now a Task's.
ALTER TABLE "chats" RENAME CONSTRAINT "chats_thread_anchor_fk" TO "chats_anchor_fk";--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_kind" CHECK ("chats"."kind" in ('channel', 'dm', 'task'));--> statement-breakpoint
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
-- Claims: the Message is in the claim's own Chat, so the Thread column, the
-- generated Message Chat, and the parent key that checked them go.
ALTER TABLE "message_claims" DROP CONSTRAINT "message_claims_thread_fk";--> statement-breakpoint
ALTER TABLE "message_claims" DROP CONSTRAINT "message_claims_message_fk";--> statement-breakpoint
ALTER TABLE "message_claims" DROP COLUMN "message_chat_id";--> statement-breakpoint
ALTER TABLE "message_claims" DROP COLUMN "thread_chat_id";--> statement-breakpoint
ALTER TABLE "message_claims" ADD CONSTRAINT "message_claims_message_fk" FOREIGN KEY ("server_id","chat_id","message_id") REFERENCES "public"."chat_messages"("server_id","chat_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_server_id_parent_key";--> statement-breakpoint
-- Task follows: the Thread follow tables were already Task follows (0122);
-- they take Task names and only the Task kind.
ALTER TABLE "thread_follows" RENAME TO "task_follows";--> statement-breakpoint
ALTER TABLE "task_follows" RENAME COLUMN "thread_chat_id" TO "task_chat_id";--> statement-breakpoint
ALTER TABLE "task_follows" RENAME COLUMN "thread_chat_kind" TO "task_chat_kind";--> statement-breakpoint
ALTER TABLE "task_follows" DROP CONSTRAINT "thread_follows_kind";--> statement-breakpoint
ALTER TABLE "task_follows" ALTER COLUMN "task_chat_kind" SET DEFAULT 'task';--> statement-breakpoint
ALTER TABLE "task_follows" RENAME CONSTRAINT "thread_follows_server_id_thread_chat_id_user_id_pk" TO "task_follows_server_id_task_chat_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "task_follows" RENAME CONSTRAINT "thread_follows_thread_fk" TO "task_follows_task_fk";--> statement-breakpoint
ALTER TABLE "task_follows" RENAME CONSTRAINT "thread_follows_membership_fk" TO "task_follows_membership_fk";--> statement-breakpoint
ALTER TABLE "task_follows" ADD CONSTRAINT "task_follows_kind" CHECK ("task_follows"."task_chat_kind" = 'task');--> statement-breakpoint
ALTER TABLE "agent_thread_follows" RENAME TO "agent_task_follows";--> statement-breakpoint
ALTER TABLE "agent_task_follows" RENAME COLUMN "thread_chat_id" TO "task_chat_id";--> statement-breakpoint
ALTER TABLE "agent_task_follows" RENAME COLUMN "thread_chat_kind" TO "task_chat_kind";--> statement-breakpoint
ALTER TABLE "agent_task_follows" DROP CONSTRAINT "agent_thread_follows_kind";--> statement-breakpoint
ALTER TABLE "agent_task_follows" ALTER COLUMN "task_chat_kind" SET DEFAULT 'task';--> statement-breakpoint
ALTER TABLE "agent_task_follows" RENAME CONSTRAINT "agent_thread_follows_server_id_agent_id_thread_chat_id_pk" TO "agent_task_follows_server_id_agent_id_task_chat_id_pk";--> statement-breakpoint
ALTER TABLE "agent_task_follows" RENAME CONSTRAINT "agent_thread_follows_agent_fk" TO "agent_task_follows_agent_fk";--> statement-breakpoint
ALTER TABLE "agent_task_follows" RENAME CONSTRAINT "agent_thread_follows_thread_fk" TO "agent_task_follows_task_fk";--> statement-breakpoint
ALTER TABLE "agent_task_follows" ADD CONSTRAINT "agent_task_follows_kind" CHECK ("agent_task_follows"."task_chat_kind" = 'task');--> statement-breakpoint
-- A mention that re-follows an Agent now only ever re-follows it into a Task.
ALTER TABLE "agent_inbox" RENAME COLUMN "thread_follow_reactivated" TO "task_follow_reactivated";--> statement-breakpoint
SET CONSTRAINTS ALL DEFERRED;
