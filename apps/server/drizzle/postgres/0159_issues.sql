CREATE TABLE "issue_comments" (
	"author_agent_id" text,
	"author_task_id" text,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"edited_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"parent_comment_id" text,
	"reply_to_comment_id" text,
	"server_id" text NOT NULL,
	CONSTRAINT "issue_comments_author_shape" CHECK (num_nonnulls("issue_comments"."author_user_id", "issue_comments"."author_agent_id", "issue_comments"."author_task_id") = 1),
	CONSTRAINT "issue_comments_reply_shape" CHECK (("issue_comments"."parent_comment_id" is null) = ("issue_comments"."reply_to_comment_id" is null)),
	CONSTRAINT "issue_comments_body_length" CHECK (char_length("issue_comments"."body") between 1 and 20000)
);
--> statement-breakpoint
CREATE TABLE "issue_events" (
	"actor_agent_id" text,
	"actor_task_id" text,
	"actor_user_id" text,
	"change" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"kind" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "issue_events_actor_shape" CHECK (num_nonnulls("issue_events"."actor_user_id", "issue_events"."actor_agent_id", "issue_events"."actor_task_id") <= 1),
	CONSTRAINT "issue_events_kind_matches" CHECK ("issue_events"."change" ->> 'kind' = "issue_events"."kind")
);
--> statement-breakpoint
CREATE TABLE "issue_subscriptions" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issue_id" text NOT NULL,
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "issue_subscriptions_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "issue_task_links" (
	"issue_id" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"linked_by_agent_id" text,
	"linked_by_task_id" text,
	"linked_by_user_id" text,
	"server_id" text NOT NULL,
	"task_id" text NOT NULL,
	CONSTRAINT "issue_task_links_issue_id_task_id_pk" PRIMARY KEY("issue_id","task_id"),
	CONSTRAINT "issue_task_links_linked_by_shape" CHECK (num_nonnulls("issue_task_links"."linked_by_user_id", "issue_task_links"."linked_by_agent_id", "issue_task_links"."linked_by_task_id") <= 1)
);
--> statement-breakpoint
CREATE TABLE "issue_label_assignments" (
	"issue_id" text NOT NULL,
	"label_id" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "issue_label_assignments_issue_id_label_id_pk" PRIMARY KEY("issue_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"assignee_agent_id" text,
	"assignee_task_id" text,
	"assignee_user_id" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"creator_agent_id" text,
	"creator_task_id" text,
	"creator_user_id" text,
	"description" text DEFAULT '' NOT NULL,
	"due_on" date,
	"id" text PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"number" integer NOT NULL,
	"parent_id" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"project_id" text NOT NULL,
	"server_id" text NOT NULL,
	"state" text DEFAULT 'todo' NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "issues_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "issues_server_project_id_key" UNIQUE("server_id","project_id","id"),
	CONSTRAINT "issues_state" CHECK ("issues"."state" in ('backlog', 'todo', 'in_progress', 'done', 'canceled')),
	CONSTRAINT "issues_closed_at" CHECK (("issues"."closed_at" is not null) = ("issues"."state" in ('done', 'canceled'))),
	CONSTRAINT "issues_priority" CHECK ("issues"."priority" in ('urgent', 'high', 'normal', 'low')),
	CONSTRAINT "issues_assignee_shape" CHECK (num_nonnulls("issues"."assignee_user_id", "issues"."assignee_agent_id", "issues"."assignee_task_id") <= 1),
	CONSTRAINT "issues_creator_shape" CHECK (num_nonnulls("issues"."creator_user_id", "issues"."creator_agent_id", "issues"."creator_task_id") = 1),
	CONSTRAINT "issues_parent_not_self" CHECK ("issues"."parent_id" is null or "issues"."parent_id" <> "issues"."id"),
	CONSTRAINT "issues_title_length" CHECK (char_length("issues"."title") between 1 and 500),
	CONSTRAINT "issues_description_length" CHECK (char_length("issues"."description") <= 20000),
	CONSTRAINT "issues_positive_number" CHECK ("issues"."number" > 0),
	CONSTRAINT "issues_positive_version" CHECK ("issues"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_issue_fk" FOREIGN KEY ("server_id","issue_id") REFERENCES "public"."issues"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_parent_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."issue_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_reply_to_fk" FOREIGN KEY ("reply_to_comment_id") REFERENCES "public"."issue_comments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_author_membership_fk" FOREIGN KEY ("server_id","author_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_author_agent_fk" FOREIGN KEY ("server_id","author_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_comments" ADD CONSTRAINT "issue_comments_author_task_fk" FOREIGN KEY ("server_id","author_task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_issue_fk" FOREIGN KEY ("server_id","issue_id") REFERENCES "public"."issues"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_actor_membership_fk" FOREIGN KEY ("server_id","actor_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_actor_agent_fk" FOREIGN KEY ("server_id","actor_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_events" ADD CONSTRAINT "issue_events_actor_task_fk" FOREIGN KEY ("server_id","actor_task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE set null (actor_task_id) ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_issue_fk" FOREIGN KEY ("server_id","issue_id") REFERENCES "public"."issues"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_subscriptions" ADD CONSTRAINT "issue_subscriptions_membership_fk" FOREIGN KEY ("server_id","user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_task_links" ADD CONSTRAINT "issue_task_links_issue_fk" FOREIGN KEY ("server_id","issue_id") REFERENCES "public"."issues"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_task_links" ADD CONSTRAINT "issue_task_links_task_fk" FOREIGN KEY ("server_id","task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_task_links" ADD CONSTRAINT "issue_task_links_linked_by_task_fk" FOREIGN KEY ("server_id","linked_by_task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE set null (linked_by_task_id) ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label_assignments" ADD CONSTRAINT "issue_label_assignments_issue_fk" FOREIGN KEY ("server_id","issue_id") REFERENCES "public"."issues"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_label_assignments" ADD CONSTRAINT "issue_label_assignments_label_fk" FOREIGN KEY ("server_id","label_id") REFERENCES "public"."task_labels"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_key_fk" FOREIGN KEY ("server_id","key_id") REFERENCES "public"."task_keys"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_fk" FOREIGN KEY ("server_id","project_id") REFERENCES "public"."projects"("server_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_fk" FOREIGN KEY ("server_id","project_id","parent_id") REFERENCES "public"."issues"("server_id","project_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_membership_fk" FOREIGN KEY ("server_id","assignee_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_agent_fk" FOREIGN KEY ("server_id","assignee_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_assignee_task_fk" FOREIGN KEY ("server_id","assignee_task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE set null (assignee_task_id) ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_creator_membership_fk" FOREIGN KEY ("server_id","creator_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_creator_agent_fk" FOREIGN KEY ("server_id","creator_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_creator_task_fk" FOREIGN KEY ("server_id","creator_task_id") REFERENCES "public"."tasks"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_comments_issue_idx" ON "issue_comments" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "issue_events_issue_idx" ON "issue_events" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "issue_subscriptions_user_idx" ON "issue_subscriptions" USING btree ("server_id","user_id");--> statement-breakpoint
CREATE INDEX "issue_task_links_task_idx" ON "issue_task_links" USING btree ("server_id","task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_key_number_key" ON "issues" USING btree ("key_id","number");--> statement-breakpoint
CREATE INDEX "issues_project_state_idx" ON "issues" USING btree ("server_id","project_id","state");--> statement-breakpoint
CREATE INDEX "issues_parent_idx" ON "issues" USING btree ("server_id","parent_id") WHERE "issues"."parent_id" is not null;--> statement-breakpoint
CREATE INDEX "issues_assignee_user_idx" ON "issues" USING btree ("server_id","assignee_user_id") WHERE "issues"."assignee_user_id" is not null;--> statement-breakpoint
CREATE INDEX "issues_assignee_agent_idx" ON "issues" USING btree ("server_id","assignee_agent_id") WHERE "issues"."assignee_agent_id" is not null;--> statement-breakpoint
CREATE INDEX "issues_assignee_task_idx" ON "issues" USING btree ("server_id","assignee_task_id") WHERE "issues"."assignee_task_id" is not null;--> statement-breakpoint
ALTER TABLE "issues" ALTER CONSTRAINT "issues_key_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issues" ALTER CONSTRAINT "issues_parent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issues" ALTER CONSTRAINT "issues_assignee_membership_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issues" ALTER CONSTRAINT "issues_assignee_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issues" ALTER CONSTRAINT "issues_creator_membership_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issues" ALTER CONSTRAINT "issues_creator_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issues" ALTER CONSTRAINT "issues_creator_task_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issue_comments" ALTER CONSTRAINT "issue_comments_parent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issue_comments" ALTER CONSTRAINT "issue_comments_reply_to_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issue_comments" ALTER CONSTRAINT "issue_comments_author_membership_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issue_comments" ALTER CONSTRAINT "issue_comments_author_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issue_events" ALTER CONSTRAINT "issue_events_actor_membership_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "issue_events" ALTER CONSTRAINT "issue_events_actor_agent_fk" DEFERRABLE INITIALLY DEFERRED;
