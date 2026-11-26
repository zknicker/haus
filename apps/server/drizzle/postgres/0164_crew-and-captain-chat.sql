-- ADR 0062 step 5b: one shared Captain chat per Captain replaces Captain DMs, Captains get a human
-- owner, inbox rows carry a Task delivery mode, crew reports are chatless inbox items, and crew
-- Tasks may name a repo and ref. Schema only: the one-off script retires old Captain DMs before
-- this runs, so the narrowed chats_shape holds.
CREATE TABLE "captain_chat_members" (
	"chat_id" text NOT NULL,
	"chat_kind" text DEFAULT 'captain' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"server_id" text NOT NULL,
	"subscribed" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "captain_chat_members_server_id_chat_id_user_id_pk" PRIMARY KEY("server_id","chat_id","user_id"),
	CONSTRAINT "captain_chat_members_kind" CHECK ("captain_chat_members"."chat_kind" = 'captain')
);
--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_addressed_reason";--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_chat";--> statement-breakpoint
ALTER TABLE "agent_run_triggers" DROP CONSTRAINT "agent_run_triggers_chat";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_kind";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_shape";--> statement-breakpoint
ALTER TABLE "chats" DROP CONSTRAINT "chats_dm_agent_fk";
--> statement-breakpoint
DROP INDEX "chats_server_agent_dm_key";--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD COLUMN "delivery" text DEFAULT 'steer' NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "captain_agent_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "repo" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "repo_ref" text;--> statement-breakpoint
ALTER TABLE "captain_chat_members" ADD CONSTRAINT "captain_chat_members_chat_fk" FOREIGN KEY ("server_id","chat_id","chat_kind") REFERENCES "public"."chats"("server_id","id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captain_chat_members" ADD CONSTRAINT "captain_chat_members_membership_fk" FOREIGN KEY ("server_id","user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "captain_chat_members_user_idx" ON "captain_chat_members" USING btree ("server_id","user_id");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_membership_fk" FOREIGN KEY ("server_id","owner_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_captain_agent_fk" FOREIGN KEY ("server_id","captain_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chats_server_captain_key" ON "chats" USING btree ("server_id","captain_agent_id") WHERE "chats"."kind" = 'captain';--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_delivery" CHECK ("agent_inbox"."delivery" in ('steer', 'interrupt', 'queue'));--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_addressed_reason" CHECK ("agent_inbox"."addressed_reason" is null
                or "agent_inbox"."addressed_reason" in ('captain_chat', 'task_chat', 'mention', 'routing', 'sole'));--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_chat" CHECK (("agent_inbox"."chat_id" is null) = ("agent_inbox"."source" in ('subagent', 'drive_conflict', 'process_exit', 'issue_assignment', 'issue_event', 'crew_report')));--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat" CHECK (("agent_run_triggers"."chat_id" is null) = ("agent_run_triggers"."source" in ('subagent', 'drive_conflict', 'process_exit', 'issue_assignment', 'issue_event', 'crew_report')));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_shape" CHECK ("agents"."kind" = 'captain' or "agents"."owner_user_id" is null);--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_kind" CHECK ("chats"."kind" in ('captain', 'channel', 'dm', 'task'));--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_shape" CHECK ((
                (
                    "chats"."kind" = 'channel'
                    and "chats"."name" is not null
                    and "chats"."captain_agent_id" is null
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
                    and "chats"."captain_agent_id" is null
                    and "chats"."dm_member_two_stint" is not null
                    and "chats"."dm_member_two_user_id" is not null
                    and "chats"."dm_member_one_user_id" collate "C" < "chats"."dm_member_two_user_id" collate "C"
                )
                or (
                    "chats"."kind" = 'task'
                    and "chats"."name" is null
                    and "chats"."color" is null
                    and "chats"."icon" is null
                    and "chats"."is_all" = false
                    and "chats"."captain_agent_id" is null
                    and "chats"."dm_member_one_stint" is null
                    and "chats"."dm_member_one_user_id" is null
                    and "chats"."dm_member_two_stint" is null
                    and "chats"."dm_member_two_user_id" is null
                    and "chats"."parent_chat_id" is not null
                    and "chats"."parent_chat_kind" = 'channel'
                )
                or (
                    "chats"."kind" = 'captain'
                    and "chats"."name" is null
                    and "chats"."color" is null
                    and "chats"."icon" is null
                    and "chats"."is_all" = false
                    and "chats"."captain_agent_id" is not null
                    and "chats"."dm_member_one_stint" is null
                    and "chats"."dm_member_one_user_id" is null
                    and "chats"."dm_member_two_stint" is null
                    and "chats"."dm_member_two_user_id" is null
                    and "chats"."parent_chat_id" is null
                    and "chats"."parent_chat_kind" is null
                )
            ));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repo_shape" CHECK ("tasks"."repo" is not null or "tasks"."repo_ref" is null);--> statement-breakpoint
ALTER TABLE "chats" DROP COLUMN "dm_agent_id";--> statement-breakpoint
ALTER TABLE "agents" ALTER CONSTRAINT "agents_owner_membership_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "chats" ALTER CONSTRAINT "chats_captain_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
CREATE TABLE "task_reports" (
	"ask" text,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"outcome" text NOT NULL,
	"person_user_id" text,
	"run_id" text NOT NULL,
	"server_id" text NOT NULL,
	"task_id" text NOT NULL,
	CONSTRAINT "task_reports_outcome" CHECK ("task_reports"."outcome" in ('done', 'needs-you', 'failed')),
	CONSTRAINT "task_reports_person_shape" CHECK ("task_reports"."person_user_id" is null or "task_reports"."outcome" = 'needs-you'),
	CONSTRAINT "task_reports_ask_length" CHECK ("task_reports"."ask" is null or char_length("task_reports"."ask") between 1 and 8000)
);
--> statement-breakpoint
ALTER TABLE "task_reports" ADD CONSTRAINT "task_reports_task_fk" FOREIGN KEY ("server_id","task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reports" ADD CONSTRAINT "task_reports_message_fk" FOREIGN KEY ("server_id","message_id") REFERENCES "public"."chat_messages"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reports" ADD CONSTRAINT "task_reports_person_fk" FOREIGN KEY ("server_id","person_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_reports_task_idx" ON "task_reports" USING btree ("server_id","task_id","created_at");
