-- Author identities are inside the same Server cascade. Check cross-links at commit.
ALTER TABLE "artifact_revisions" ALTER CONSTRAINT "artifact_revisions_server_id_author_agent_id_agents_server_id_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "artifact_revisions" ALTER CONSTRAINT "artifact_revisions_server_id_author_user_id_server_memberships_server_id_user_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "artifacts" ALTER CONSTRAINT "artifacts_server_id_creator_agent_id_agents_server_id_id_fk" DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "artifacts" ALTER CONSTRAINT "artifacts_server_id_creator_user_id_server_memberships_server_id_user_id_fk" DEFERRABLE INITIALLY DEFERRED;
