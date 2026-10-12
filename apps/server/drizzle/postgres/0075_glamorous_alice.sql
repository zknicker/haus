CREATE TABLE "artifact_revisions" (
	"artifact_id" text NOT NULL,
	"author_agent_id" text,
	"author_key" text NOT NULL,
	"author_user_id" text,
	"byte_size" bigint DEFAULT 0 NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"filename" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"request_id" text NOT NULL,
	"reserved_bytes" bigint NOT NULL,
	"revision_number" integer NOT NULL,
	"server_id" text NOT NULL,
	"sha256" text,
	"state" text NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "artifact_revision_author_shape" CHECK (num_nonnulls("artifact_revisions"."author_agent_id", "artifact_revisions"."author_user_id") = 1),
	CONSTRAINT "artifact_revision_size" CHECK ("artifact_revisions"."byte_size" >= 0 and "artifact_revisions"."byte_size" <= 268435456 and "artifact_revisions"."reserved_bytes" >= 0),
	CONSTRAINT "artifact_revision_state" CHECK ("artifact_revisions"."state" in ('uploading', 'ready', 'failed', 'deleting', 'deleted')),
	CONSTRAINT "artifact_revision_ready" CHECK ("artifact_revisions"."state" <> 'ready' or "artifact_revisions"."sha256" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"creator_agent_id" text,
	"creator_user_id" text,
	"current_revision_id" text,
	"deleted_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"next_revision" integer DEFAULT 1 NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "artifacts_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "artifacts_creator_shape" CHECK (num_nonnulls("artifacts"."creator_agent_id", "artifacts"."creator_user_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_artifact_fk" FOREIGN KEY ("server_id","artifact_id") REFERENCES "public"."artifacts"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_server_id_author_agent_id_agents_server_id_id_fk" FOREIGN KEY ("server_id","author_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_revisions" ADD CONSTRAINT "artifact_revisions_server_id_author_user_id_server_memberships_server_id_user_id_fk" FOREIGN KEY ("server_id","author_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_server_id_creator_agent_id_agents_server_id_id_fk" FOREIGN KEY ("server_id","creator_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_server_id_creator_user_id_server_memberships_server_id_user_id_fk" FOREIGN KEY ("server_id","creator_user_id") REFERENCES "public"."server_memberships"("server_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_revision_nonce_key" ON "artifact_revisions" USING btree ("server_id","author_key","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_revision_number_key" ON "artifact_revisions" USING btree ("server_id","artifact_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_revision_tenant_key" ON "artifact_revisions" USING btree ("server_id","artifact_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_server_name_key" ON "artifacts" USING btree ("server_id","name") WHERE "artifacts"."deleted_at" is null;