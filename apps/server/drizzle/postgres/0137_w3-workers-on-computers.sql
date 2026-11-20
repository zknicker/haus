-- W3: Workers run on Computers (specs/workers.md "Workers on a Computer", specs/projects.md "Repos"
-- and "Default place for Workers"). Every step converges, so running this file again changes nothing.
-- Existing rows: every Computer is off with a limit of 4, no Project has repos, and each Project's
-- default place comes from the Server's newest cloud Worker's carrier.
CREATE TABLE IF NOT EXISTS "worker_turn_credentials" (
	"attempt" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"server_id" text NOT NULL,
	"token_hash" text PRIMARY KEY NOT NULL,
	"turn_id" text NOT NULL,
	CONSTRAINT "worker_turn_credentials_kind" CHECK ("worker_turn_credentials"."kind" in ('turn', 'push')),
	CONSTRAINT "worker_turn_credentials_attempt" CHECK ("worker_turn_credentials"."attempt" >= 1),
	CONSTRAINT "worker_turn_credentials_token_hash_shape" CHECK ("worker_turn_credentials"."token_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_repo_links" (
	"checkout_path" text,
	"computer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"linked_by_user_id" text NOT NULL,
	"project_repo_id" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "project_repo_links_pkey" PRIMARY KEY("project_repo_id","computer_id"),
	CONSTRAINT "project_repo_links_checkout_path_shape" CHECK ("project_repo_links"."checkout_path" is null
                or char_length("project_repo_links"."checkout_path") between 1 and 1024)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_repos" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"repository" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "project_repos_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "project_repos_repository_key" UNIQUE("server_id","project_id","repository"),
	CONSTRAINT "project_repos_id_shape" CHECK ("project_repos"."id" ~ '^prp_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "project_repos_repository_shape" CHECK ("project_repos"."repository" ~ '^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'
                and char_length("project_repos"."repository") <= 200)
);
--> statement-breakpoint
ALTER TABLE "computers" ADD COLUMN IF NOT EXISTS "worker_limit" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
ALTER TABLE "computers" ADD COLUMN IF NOT EXISTS "workers_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_pushes" ADD COLUMN IF NOT EXISTS "worker_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "default_worker_computer_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "default_worker_place" text;--> statement-breakpoint
ALTER TABLE "worker_turns" ADD COLUMN IF NOT EXISTS "dispatch_attempt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_turns" ADD COLUMN IF NOT EXISTS "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "worker_turns" ADD COLUMN IF NOT EXISTS "report_draft" jsonb;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "branch" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "model" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "native_session_id" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "runtime" text;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "worker_md_revision_id" text;--> statement-breakpoint
ALTER TABLE "worker_turn_credentials" DROP CONSTRAINT IF EXISTS "worker_turn_credentials_turn_fk";--> statement-breakpoint
ALTER TABLE "worker_turn_credentials" ADD CONSTRAINT "worker_turn_credentials_turn_fk" FOREIGN KEY ("server_id","turn_id") REFERENCES "public"."worker_turns"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repo_links" DROP CONSTRAINT IF EXISTS "project_repo_links_repo_fk";--> statement-breakpoint
ALTER TABLE "project_repo_links" ADD CONSTRAINT "project_repo_links_repo_fk" FOREIGN KEY ("server_id","project_repo_id") REFERENCES "public"."project_repos"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repo_links" DROP CONSTRAINT IF EXISTS "project_repo_links_computer_fk";--> statement-breakpoint
ALTER TABLE "project_repo_links" ADD CONSTRAINT "project_repo_links_computer_fk" FOREIGN KEY ("server_id","computer_id") REFERENCES "public"."computers"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repo_links" DROP CONSTRAINT IF EXISTS "project_repo_links_linker_membership_fk";--> statement-breakpoint
ALTER TABLE "project_repo_links" ADD CONSTRAINT "project_repo_links_linker_membership_fk" FOREIGN KEY ("server_id","linked_by_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repos" DROP CONSTRAINT IF EXISTS "project_repos_project_fk";--> statement-breakpoint
ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_project_fk" FOREIGN KEY ("server_id","project_id") REFERENCES "public"."projects"("server_id","chat_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_turn_credentials_turn_idx" ON "worker_turn_credentials" USING btree ("server_id","turn_id");--> statement-breakpoint
ALTER TABLE "drive_pushes" DROP CONSTRAINT IF EXISTS "drive_pushes_worker_fk";--> statement-breakpoint
ALTER TABLE "drive_pushes" ADD CONSTRAINT "drive_pushes_worker_fk" FOREIGN KEY ("server_id","worker_id") REFERENCES "public"."workers"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_default_worker_computer_fk";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_default_worker_computer_fk" FOREIGN KEY ("server_id","default_worker_computer_id") REFERENCES "public"."computers"("server_id","id") ON DELETE set null (default_worker_computer_id) ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drive_pushes_worker_open" ON "drive_pushes" USING btree ("server_id","worker_id") WHERE "drive_pushes"."closed_at" is null and "drive_pushes"."worker_id" is not null;--> statement-breakpoint
ALTER TABLE "computers" DROP CONSTRAINT IF EXISTS "computers_worker_limit";--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_worker_limit" CHECK ("computers"."worker_limit" between 1 and 50);--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_default_worker_place";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_default_worker_place" CHECK ("projects"."default_worker_place" is null
                or "projects"."default_worker_place" in ('cursor', 'claude', 'computer'));--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_default_worker_computer";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_default_worker_computer" CHECK (coalesce("projects"."default_worker_place" = 'computer', false)
                = ("projects"."default_worker_computer_id" is not null));--> statement-breakpoint
ALTER TABLE "worker_turns" DROP CONSTRAINT IF EXISTS "worker_turns_dispatch_attempt";--> statement-breakpoint
ALTER TABLE "worker_turns" ADD CONSTRAINT "worker_turns_dispatch_attempt" CHECK ("worker_turns"."dispatch_attempt" >= 0);--> statement-breakpoint
ALTER TABLE "worker_turns" DROP CONSTRAINT IF EXISTS "worker_turns_report_draft_shape";--> statement-breakpoint
ALTER TABLE "worker_turns" ADD CONSTRAINT "worker_turns_report_draft_shape" CHECK ("worker_turns"."report_draft" is null or jsonb_typeof("worker_turns"."report_draft") = 'object');--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_runtime";--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_runtime" CHECK (("workers"."runtime" is not null) = ("workers"."place" = 'computer')
                and ("workers"."runtime" is null or "workers"."runtime" in ('claude-code', 'codex')));--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_model_length";--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_model_length" CHECK ("workers"."model" is null or char_length("workers"."model") between 1 and 200);--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_branch_length";--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_branch_length" CHECK ("workers"."branch" is null or char_length("workers"."branch") between 1 and 300);--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_native_session_length";--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_native_session_length" CHECK ("workers"."native_session_id" is null or char_length("workers"."native_session_id") between 1 and 200);--> statement-breakpoint
ALTER TABLE "workers" DROP CONSTRAINT IF EXISTS "workers_place";--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_place" CHECK ("workers"."place" in ('cursor', 'claude', 'computer'));--> statement-breakpoint
-- Each Project's default becomes the default provider of the Computer that carries the Server's
-- newest cloud Worker. A Server whose carrier names no default leaves its defaults unset.
UPDATE "projects" AS p SET "default_worker_place" = d."provider"
FROM (
    SELECT DISTINCT ON (w."server_id") w."server_id",
        (
            SELECT entry->>'provider'
            FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(c."reported_inventory"->'cloudAgentProviders') = 'array'
                    THEN c."reported_inventory"->'cloudAgentProviders'
                    ELSE '[]'::jsonb
                END
            ) AS entry
            WHERE entry->>'isDefault' = 'true' AND entry->>'provider' IN ('cursor', 'claude')
            LIMIT 1
        ) AS "provider"
    FROM "workers" AS w
    JOIN "computers" AS c ON c."server_id" = w."server_id" AND c."id" = w."carrier_computer_id"
    WHERE w."place" IN ('cursor', 'claude')
    ORDER BY w."server_id", w."created_at" DESC, w."id" DESC
) AS d
WHERE p."server_id" = d."server_id" AND d."provider" IS NOT NULL
    AND p."default_worker_place" IS NULL;
