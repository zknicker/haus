CREATE TABLE "agent_managed_skills" (
	"agent_id" text NOT NULL,
	"pending_release_fingerprint" text,
	"release_fingerprint" text NOT NULL,
	"seeded_fingerprint" text NOT NULL,
	"server_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_managed_skills_server_id_agent_id_skill_id_pk" PRIMARY KEY("server_id","agent_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "artifact_revisions" DROP CONSTRAINT "artifact_revision_author_shape";--> statement-breakpoint
ALTER TABLE "agent_managed_skills" ADD CONSTRAINT "agent_managed_skills_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revision_author_shape" CHECK (num_nonnulls("artifact_revisions"."author_agent_id", "artifact_revisions"."author_user_id") = 1 or ("artifact_revisions"."author_key" = 'haus' and num_nonnulls("artifact_revisions"."author_agent_id", "artifact_revisions"."author_user_id") = 0));