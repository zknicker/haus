-- ADR 0060: repos belong to the Server, each Computer lists its repo folders, and
-- project_repos and project_repo_links retire. The Server's list starts with every repo its
-- Workers ran in and every Project repo, lower-cased. No folder migrates: project_repo_links
-- is empty in production, and a Computer re-clones into the Server's partition on next use.
CREATE TABLE IF NOT EXISTS "repos" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"repository" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "repos_pkey" PRIMARY KEY("server_id","repository"),
	CONSTRAINT "repos_repository_shape" CHECK ("repos"."repository" ~ '^[a-z0-9._-]+/[a-z0-9._-]+$'
                and char_length("repos"."repository") <= 200)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repo_folders" (
	"added_by_user_id" text,
	"computer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text NOT NULL,
	"repository" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "repo_folders_pkey" PRIMARY KEY("server_id","computer_id","repository"),
	CONSTRAINT "repo_folders_path_key" UNIQUE("server_id","computer_id","path"),
	CONSTRAINT "repo_folders_path_shape" CHECK ("repo_folders"."path" like '/%' and char_length("repo_folders"."path") between 2 and 1024)
);
--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN IF NOT EXISTS "kept_worktree_path" text;--> statement-breakpoint
ALTER TABLE "repo_folders" DROP CONSTRAINT IF EXISTS "repo_folders_repo_fk";--> statement-breakpoint
ALTER TABLE "repo_folders" ADD CONSTRAINT "repo_folders_repo_fk" FOREIGN KEY ("server_id","repository") REFERENCES "public"."repos"("server_id","repository") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_folders" DROP CONSTRAINT IF EXISTS "repo_folders_computer_fk";--> statement-breakpoint
ALTER TABLE "repo_folders" ADD CONSTRAINT "repo_folders_computer_fk" FOREIGN KEY ("server_id","computer_id") REFERENCES "public"."computers"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_folders" DROP CONSTRAINT IF EXISTS "repo_folders_adder_membership_fk";--> statement-breakpoint
ALTER TABLE "repo_folders" ADD CONSTRAINT "repo_folders_adder_membership_fk" FOREIGN KEY ("server_id","added_by_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
INSERT INTO "repos" ("server_id", "repository")
SELECT DISTINCT "server_id", lower("repository")
FROM "workers"
WHERE lower("repository") ~ '^[a-z0-9._-]+/[a-z0-9._-]+$' AND char_length("repository") <= 200
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "repos" ("server_id", "repository")
SELECT DISTINCT "server_id", lower("repository")
FROM "project_repos"
WHERE lower("repository") ~ '^[a-z0-9._-]+/[a-z0-9._-]+$'
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP TABLE IF EXISTS "project_repo_links" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "project_repos" CASCADE;
