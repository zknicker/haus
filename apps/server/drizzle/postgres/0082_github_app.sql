CREATE TABLE "github_delivery_cursor" (
	"app_id" bigint PRIMARY KEY NOT NULL,
	"gap_from" timestamp with time zone,
	"gap_to" timestamp with time zone,
	"last_swept_at" timestamp with time zone,
	"watermark" timestamp with time zone NOT NULL,
	CONSTRAINT "github_delivery_cursor_gap" CHECK (("github_delivery_cursor"."gap_from" is null) = ("github_delivery_cursor"."gap_to" is null))
);
--> statement-breakpoint
CREATE TABLE "github_installations" (
	"accessible_repository_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"access_synced_at" timestamp with time zone,
	"account_id" bigint NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text NOT NULL,
	"bound_by_user_id" text,
	"connection_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"events" text[] NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"installation_id" bigint NOT NULL,
	"permissions" jsonb NOT NULL,
	"removed_at" timestamp with time zone,
	"repository_selection" text NOT NULL,
	"server_id" text NOT NULL,
	"status" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "github_installations_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "github_installations_id_shape" CHECK ("github_installations"."id" ~ '^ghi_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "github_installations_account_type" CHECK ("github_installations"."account_type" in ('User', 'Organization')),
	CONSTRAINT "github_installations_repository_selection" CHECK ("github_installations"."repository_selection" in ('all', 'selected')),
	CONSTRAINT "github_installations_status" CHECK ("github_installations"."status" in ('active', 'suspended', 'removed')),
	CONSTRAINT "github_installations_tombstone" CHECK (("github_installations"."status" = 'removed') = ("github_installations"."removed_at" is not null)
                and ("github_installations"."status" = 'removed') = ("github_installations"."connection_id" is null))
);
--> statement-breakpoint
CREATE TABLE "github_trigger_configs" (
	"events" jsonb NOT NULL,
	"installation_row_id" text NOT NULL,
	"last_suppressed_at" timestamp with time zone,
	"problem" text,
	"problem_since" timestamp with time zone,
	"repository_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"repository_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"repository_scope" text NOT NULL,
	"server_id" text NOT NULL,
	"suppressed_count" integer DEFAULT 0 NOT NULL,
	"trigger_id" text PRIMARY KEY NOT NULL,
	CONSTRAINT "github_trigger_configs_repositories" CHECK ((
                "github_trigger_configs"."repository_scope" = 'installation'
                and cardinality("github_trigger_configs"."repository_ids") = 0
                and cardinality("github_trigger_configs"."repository_names") = 0
            ) or (
                "github_trigger_configs"."repository_scope" = 'repositories'
                and cardinality("github_trigger_configs"."repository_ids") between 1 and 50
                and cardinality("github_trigger_configs"."repository_names") = cardinality("github_trigger_configs"."repository_ids")
            )),
	CONSTRAINT "github_trigger_configs_problem" CHECK ("github_trigger_configs"."problem" is null or "github_trigger_configs"."problem" in (
                'installation_removed', 'installation_suspended', 'repositories_unavailable',
                'permissions_missing', 'agent_access_revoked', 'sign_in_required'
            )),
	CONSTRAINT "github_trigger_configs_problem_since" CHECK (("github_trigger_configs"."problem" is null) = ("github_trigger_configs"."problem_since" is null)),
	CONSTRAINT "github_trigger_configs_nonnegative_suppressed" CHECK ("github_trigger_configs"."suppressed_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "github_webhook_deliveries" (
	"action" text,
	"delivery_guid" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"ignored_reason" text,
	"installation_id" bigint,
	"received_at" timestamp with time zone NOT NULL,
	"routed_count" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "github_webhook_deliveries_guid_length" CHECK (char_length("github_webhook_deliveries"."delivery_guid") between 1 and 64),
	CONSTRAINT "github_webhook_deliveries_source" CHECK ("github_webhook_deliveries"."source" in ('webhook', 'recovery')),
	CONSTRAINT "github_webhook_deliveries_state" CHECK ("github_webhook_deliveries"."state" in ('processing', 'done')),
	CONSTRAINT "github_webhook_deliveries_nonnegative_routed" CHECK ("github_webhook_deliveries"."routed_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "triggers" DROP CONSTRAINT "triggers_kind";--> statement-breakpoint
ALTER TABLE "triggers" ALTER COLUMN "secret_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD COLUMN "agent_chain_advanced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_bound_by_user_id_users_id_fk" FOREIGN KEY ("bound_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_connection_fk" FOREIGN KEY ("server_id","connection_id") REFERENCES "public"."mcp_connections"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_trigger_configs" ADD CONSTRAINT "github_trigger_configs_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_trigger_configs" ADD CONSTRAINT "github_trigger_configs_trigger_fk" FOREIGN KEY ("server_id","trigger_id") REFERENCES "public"."triggers"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_trigger_configs" ADD CONSTRAINT "github_trigger_configs_installation_fk" FOREIGN KEY ("server_id","installation_row_id") REFERENCES "public"."github_installations"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_installations_live_installation_key" ON "github_installations" USING btree ("installation_id") WHERE "github_installations"."status" <> 'removed';--> statement-breakpoint
CREATE INDEX "github_installations_connection_idx" ON "github_installations" USING btree ("server_id","connection_id");--> statement-breakpoint
CREATE INDEX "github_trigger_configs_installation_idx" ON "github_trigger_configs" USING btree ("server_id","installation_row_id");--> statement-breakpoint
CREATE INDEX "github_webhook_deliveries_received_idx" ON "github_webhook_deliveries" USING btree ("received_at");--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_secret_kind" CHECK (("triggers"."kind" = 'webhook') = ("triggers"."secret_hash" is not null));--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_kind" CHECK ("triggers"."kind" in ('webhook', 'github'));--> statement-breakpoint
-- Links inside the Server cascade are checked at commit, so a Server purge can delete in any order.
ALTER TABLE "github_installations" ALTER CONSTRAINT "github_installations_connection_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "github_trigger_configs" ALTER CONSTRAINT "github_trigger_configs_installation_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- The GitHub OAuth App's tokens do not work with the GitHub App. Every GitHub
-- connection signs in again, and an Owner or Admin regrants Agents afterwards.
DELETE FROM "mcp_secrets" WHERE "connection_id" IN (SELECT "id" FROM "mcp_connections" WHERE "preset" = 'github');--> statement-breakpoint
DELETE FROM "agent_mcp_connection_grants" WHERE ("server_id", "connection_id") IN (SELECT "server_id", "id" FROM "mcp_connections" WHERE "preset" = 'github');--> statement-breakpoint
UPDATE "mcp_connections" SET "connected" = false, "tools" = '{}', "account_label" = NULL WHERE "preset" = 'github';