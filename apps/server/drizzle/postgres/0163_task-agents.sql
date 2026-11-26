-- ADR 0062 step 5: a Task gets its own hidden agent of kind `task`, a Machine and a model fixed at
-- start, and a Captain when it is crew. Captains gain their crew Machine and crew model.
ALTER TABLE "agent_invocations" DROP CONSTRAINT "agent_invocations_refusal";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_home_project_shape";--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "crew_computer_id" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "crew_model" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "kind" text DEFAULT 'captain' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "captain_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "computer_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "start_request_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "title_custom" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_crew_computer_fk" FOREIGN KEY ("server_id","crew_computer_id") REFERENCES "public"."computers"("server_id","id") ON DELETE set null (crew_computer_id) ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_captain_fk" FOREIGN KEY ("server_id","captain_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_computer_fk" FOREIGN KEY ("server_id","computer_id") REFERENCES "public"."computers"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_agent_key" ON "tasks" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_start_request_key" ON "tasks" USING btree ("server_id","start_request_id") WHERE "tasks"."start_request_id" is not null;--> statement-breakpoint
CREATE INDEX "tasks_captain_idx" ON "tasks" USING btree ("server_id","captain_id") WHERE "tasks"."captain_id" is not null;--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_refusal" CHECK ("agent_invocations"."refusal" is null or ("agent_invocations"."refusal" in ('not-found', 'no-access', 'moved', 'desktop-busy', 'task-machine-only', 'off', 'not-listed', 'not-mac', 'offline', 'not-ready', 'locked', 'no-session', 'switched-out') and "agent_invocations"."state" = 'finished'));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_kind" CHECK ("agents"."kind" in ('captain', 'task'));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_crew_shape" CHECK ("agents"."kind" = 'captain' or ("agents"."crew_computer_id" is null and "agents"."crew_model" is null));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_crew_model_length" CHECK ("agents"."crew_model" is null or char_length("agents"."crew_model") between 1 and 128);--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_home_project_shape" CHECK (case when "agents"."kind" = 'task'
                then "agents"."home_project_id" is null
                else "agents"."home_project_id" is not null or "agents"."retired_at" is not null end);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_session_shape" CHECK (("tasks"."agent_id" is null) = ("tasks"."model" is null)
                and ("tasks"."agent_id" is not null or "tasks"."computer_id" is null));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_machine_shape" CHECK ("tasks"."computer_id" is not null or "tasks"."agent_id" is null or "tasks"."archived_at" is not null);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_captain_shape" CHECK ("tasks"."captain_id" is null or ("tasks"."agent_id" is not null and "tasks"."created_by_agent_id" = "tasks"."captain_id"));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_start_request_length" CHECK ("tasks"."start_request_id" is null or char_length("tasks"."start_request_id") between 1 and 128);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_model_length" CHECK ("tasks"."model" is null or char_length("tasks"."model") between 1 and 128);--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_captain_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "tasks" ALTER CONSTRAINT "tasks_computer_fk" DEFERRABLE INITIALLY DEFERRED;