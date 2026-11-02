-- A task may sit on a Thread message. chat_id stays the top-level Channel or DM
-- (number, assignees, access); thread_chat_id names the Thread the message is in.
ALTER TABLE "chats" ADD CONSTRAINT "chats_server_id_parent_key" UNIQUE("server_id","id","parent_chat_id");--> statement-breakpoint
ALTER TABLE "message_tasks" ADD COLUMN "thread_chat_id" text;--> statement-breakpoint
ALTER TABLE "message_tasks" ADD COLUMN "message_chat_id" text NOT NULL GENERATED ALWAYS AS (coalesce(thread_chat_id, chat_id)) STORED;--> statement-breakpoint
ALTER TABLE "message_tasks" DROP CONSTRAINT "message_tasks_message_fk";--> statement-breakpoint
ALTER TABLE "message_tasks" ADD CONSTRAINT "message_tasks_message_fk" FOREIGN KEY ("server_id","message_chat_id","message_id") REFERENCES "public"."chat_messages"("server_id","chat_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_tasks" ADD CONSTRAINT "message_tasks_thread_fk" FOREIGN KEY ("server_id","thread_chat_id","chat_id") REFERENCES "public"."chats"("server_id","id","parent_chat_id") ON DELETE cascade ON UPDATE no action;
