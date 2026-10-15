CREATE TABLE "linear_identities" (
	"agent_id" text NOT NULL,
	"app_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	"handle" text,
	"id" text PRIMARY KEY NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"oauth_client_id" text,
	"organization_id" text NOT NULL,
	"removed_at" timestamp with time zone,
	"server_id" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "linear_identities_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "linear_identities_workspace_key" UNIQUE("server_id","workspace_id","id"),
	CONSTRAINT "linear_identities_id_shape" CHECK ("linear_identities"."id" ~ '^lni_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_identities_status" CHECK ("linear_identities"."status" in ('draft', 'active', 'inactive', 'refresh_required', 'revoked', 'removed')),
	CONSTRAINT "linear_identities_tombstone" CHECK (("linear_identities"."status" = 'removed') = ("linear_identities"."removed_at" is not null)),
	CONSTRAINT "linear_identities_installed" CHECK ("linear_identities"."status" in ('draft', 'removed') or (
                "linear_identities"."oauth_client_id" is not null
                and "linear_identities"."app_user_id" is not null
                and "linear_identities"."handle" is not null
            ))
);
--> statement-breakpoint
CREATE TABLE "linear_oauth_attempts" (
	"code_verifier" text NOT NULL,
	"connection_id" text,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"identity_id" text,
	"initiated_by_user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"server_id" text NOT NULL,
	"state_hash" text NOT NULL,
	CONSTRAINT "linear_oauth_attempts_state_hash_key" UNIQUE("state_hash"),
	CONSTRAINT "linear_oauth_attempts_id_shape" CHECK ("linear_oauth_attempts"."id" ~ '^lno_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_oauth_attempts_state_hash" CHECK ("linear_oauth_attempts"."state_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "linear_oauth_attempts_purpose" CHECK ((
                "linear_oauth_attempts"."purpose" = 'workspace_install'
                and "linear_oauth_attempts"."connection_id" is null and "linear_oauth_attempts"."identity_id" is null
            ) or (
                "linear_oauth_attempts"."purpose" = 'workspace_reconnect'
                and "linear_oauth_attempts"."connection_id" is not null and "linear_oauth_attempts"."identity_id" is null
            ) or (
                "linear_oauth_attempts"."purpose" = 'identity_install'
                and "linear_oauth_attempts"."connection_id" is not null and "linear_oauth_attempts"."identity_id" is not null
            ))
);
--> statement-breakpoint
CREATE TABLE "linear_workspaces" (
	"app_user_id" text NOT NULL,
	"bound_by_user_id" text,
	"connection_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"default_agent_id" text,
	"id" text PRIMARY KEY NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"removed_at" timestamp with time zone,
	"server_id" text NOT NULL,
	"status" text NOT NULL,
	"teams_synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"url_key" text NOT NULL,
	CONSTRAINT "linear_workspaces_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "linear_workspaces_connection_key" UNIQUE("connection_id"),
	CONSTRAINT "linear_workspaces_id_shape" CHECK ("linear_workspaces"."id" ~ '^lnw_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_workspaces_status" CHECK ("linear_workspaces"."status" in ('active', 'refresh_required', 'revoked', 'disconnected', 'removed')),
	CONSTRAINT "linear_workspaces_tombstone" CHECK (("linear_workspaces"."status" = 'removed') = ("linear_workspaces"."removed_at" is not null)
                and ("linear_workspaces"."status" = 'removed') = ("linear_workspaces"."connection_id" is null))
);
--> statement-breakpoint
CREATE TABLE "linear_agent_labels" (
	"agent_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"label_id" text,
	"server_id" text NOT NULL,
	"state" text NOT NULL,
	"team_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "linear_agent_labels_label_key" UNIQUE("label_id"),
	CONSTRAINT "linear_agent_labels_id_shape" CHECK ("linear_agent_labels"."id" ~ '^lnb_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_agent_labels_state" CHECK ("linear_agent_labels"."state" in ('pending', 'active', 'archived')),
	CONSTRAINT "linear_agent_labels_created" CHECK ("linear_agent_labels"."state" <> 'active' or "linear_agent_labels"."label_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "linear_label_groups" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"group_label_id" text NOT NULL,
	"server_id" text NOT NULL,
	"team_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "linear_label_groups_workspace_id_team_id_pk" PRIMARY KEY("workspace_id","team_id"),
	CONSTRAINT "linear_label_groups_group_label_key" UNIQUE("group_label_id")
);
--> statement-breakpoint
CREATE TABLE "linear_trigger_configs" (
	"display" jsonb NOT NULL,
	"groups" jsonb NOT NULL,
	"last_suppressed_at" timestamp with time zone,
	"problem" text,
	"problem_since" timestamp with time zone,
	"self_suppressed_count" integer DEFAULT 0 NOT NULL,
	"server_id" text NOT NULL,
	"suppressed_count" integer DEFAULT 0 NOT NULL,
	"trigger_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "linear_trigger_configs_problem" CHECK ("linear_trigger_configs"."problem" is null or "linear_trigger_configs"."problem" in (
                'workspace_removed', 'sign_in_required', 'agent_access_revoked',
                'teams_unavailable', 'references_unavailable'
            )),
	CONSTRAINT "linear_trigger_configs_problem_since" CHECK (("linear_trigger_configs"."problem" is null) = ("linear_trigger_configs"."problem_since" is null)),
	CONSTRAINT "linear_trigger_configs_nonnegative_suppressed" CHECK ("linear_trigger_configs"."suppressed_count" >= 0 and "linear_trigger_configs"."self_suppressed_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "linear_writes" (
	"agent_id" text NOT NULL,
	"client_entity_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credential_id" text NOT NULL,
	"field_fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"op_index" integer NOT NULL,
	"request_id" text NOT NULL,
	"result" jsonb,
	"result_entity_id" text,
	"result_updated_at" timestamp with time zone,
	"server_id" text NOT NULL,
	"status" text NOT NULL,
	"target_id" text,
	"target_type" text NOT NULL,
	"tool" text NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "linear_writes_request_key" UNIQUE("workspace_id","request_id","op_index"),
	CONSTRAINT "linear_writes_id_shape" CHECK ("linear_writes"."id" ~ '^lnl_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_writes_status" CHECK ("linear_writes"."status" in ('pending', 'succeeded', 'failed', 'unknown')),
	CONSTRAINT "linear_writes_target_type" CHECK ("linear_writes"."target_type" in (
                'issue', 'comment', 'project', 'document', 'label', 'workflow_state',
                'agent_activity'
            )),
	CONSTRAINT "linear_writes_request" CHECK (char_length("linear_writes"."request_id") between 1 and 200 and "linear_writes"."op_index" >= 0),
	CONSTRAINT "linear_writes_fingerprint" CHECK ("linear_writes"."field_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "linear_writes_succeeded" CHECK ("linear_writes"."status" <> 'succeeded' or (
                "linear_writes"."result" is not null and "linear_writes"."completed_at" is not null
            )),
	CONSTRAINT "linear_writes_result_size" CHECK ("linear_writes"."result" is null or octet_length("linear_writes"."result"::text) <= 8192)
);
--> statement-breakpoint
CREATE TABLE "linear_credentials" (
	"access_expires_at" timestamp with time zone NOT NULL,
	"access_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"identity_id" text,
	"refresh_token" text NOT NULL,
	"scopes" text[] NOT NULL,
	"server_id" text NOT NULL,
	"state" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "linear_credentials_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "linear_credentials_identity_key" UNIQUE("identity_id"),
	CONSTRAINT "linear_credentials_id_shape" CHECK ("linear_credentials"."id" ~ '^lna_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_credentials_state" CHECK ("linear_credentials"."state" in ('valid', 'refresh_required', 'revoked')),
	CONSTRAINT "linear_credentials_positive_generation" CHECK ("linear_credentials"."generation" > 0)
);
--> statement-breakpoint
CREATE TABLE "linear_identity_secrets" (
	"identity_id" text PRIMARY KEY NOT NULL,
	"previous_expires_at" timestamp with time zone,
	"previous_webhook_secret" text,
	"server_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"webhook_secret" text NOT NULL,
	CONSTRAINT "linear_identity_secrets_previous" CHECK (("linear_identity_secrets"."previous_webhook_secret" is null) = ("linear_identity_secrets"."previous_expires_at" is null))
);
--> statement-breakpoint
CREATE TABLE "linear_team_access" (
	"credential_id" text NOT NULL,
	"server_id" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"team_id" text NOT NULL,
	"team_key" text NOT NULL,
	"team_name" text NOT NULL,
	CONSTRAINT "linear_team_access_credential_id_team_id_pk" PRIMARY KEY("credential_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "linear_agent_sessions" (
	"acked_at" timestamp with time zone,
	"agent_id" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"identity_id" text,
	"issue_id" text NOT NULL,
	"issue_identifier" text NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"linear_session_id" text NOT NULL,
	"server_id" text NOT NULL,
	"status" text NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "linear_agent_sessions_linear_session_key" UNIQUE("workspace_id","linear_session_id"),
	CONSTRAINT "linear_agent_sessions_id_shape" CHECK ("linear_agent_sessions"."id" ~ '^lss_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_agent_sessions_status" CHECK ("linear_agent_sessions"."status" in ('active', 'complete', 'stopped', 'orphaned')),
	CONSTRAINT "linear_agent_sessions_closed" CHECK (("linear_agent_sessions"."status" = 'active') = ("linear_agent_sessions"."closed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "linear_webhook_deliveries" (
	"action" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"ignored_reason" text,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"organization_id" text,
	"processed_at" timestamp with time zone,
	"projection" jsonb NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"receiver" text NOT NULL,
	"routed_count" integer DEFAULT 0 NOT NULL,
	"server_id" text,
	"state" text NOT NULL,
	"webhook_timestamp" timestamp with time zone NOT NULL,
	"workspace_id" text,
	CONSTRAINT "linear_webhook_deliveries_delivery_key" UNIQUE("receiver","delivery_id"),
	CONSTRAINT "linear_webhook_deliveries_id_shape" CHECK ("linear_webhook_deliveries"."id" ~ '^lnd_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_webhook_deliveries_delivery_id" CHECK ("linear_webhook_deliveries"."delivery_id" ~ '^[A-Za-z0-9-]{1,64}$'),
	CONSTRAINT "linear_webhook_deliveries_receiver" CHECK ("linear_webhook_deliveries"."receiver" = 'app' or "linear_webhook_deliveries"."receiver" ~ '^lni_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "linear_webhook_deliveries_state" CHECK ("linear_webhook_deliveries"."state" in ('queued', 'processing', 'done', 'ignored', 'failed')),
	CONSTRAINT "linear_webhook_deliveries_ignored" CHECK (("linear_webhook_deliveries"."state" = 'ignored') = ("linear_webhook_deliveries"."ignored_reason" is not null)
                and ("linear_webhook_deliveries"."ignored_reason" is null or "linear_webhook_deliveries"."ignored_reason" in (
                    'unknown_workspace', 'workspace_inactive', 'unsupported_event',
                    'team_outside_access'
                ))),
	CONSTRAINT "linear_webhook_deliveries_routing" CHECK (("linear_webhook_deliveries"."server_id" is null) = ("linear_webhook_deliveries"."workspace_id" is null)
                and ("linear_webhook_deliveries"."server_id" is not null or "linear_webhook_deliveries"."state" = 'ignored')),
	CONSTRAINT "linear_webhook_deliveries_processed" CHECK (("linear_webhook_deliveries"."state" in ('done', 'ignored', 'failed')) = ("linear_webhook_deliveries"."processed_at" is not null)),
	CONSTRAINT "linear_webhook_deliveries_projection_size" CHECK (octet_length("linear_webhook_deliveries"."projection"::text) <= 65536),
	CONSTRAINT "linear_webhook_deliveries_nonnegative" CHECK ("linear_webhook_deliveries"."attempts" >= 0 and "linear_webhook_deliveries"."routed_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "triggers" DROP CONSTRAINT "triggers_kind";--> statement-breakpoint
ALTER TABLE "linear_identities" ADD CONSTRAINT "linear_identities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_identities" ADD CONSTRAINT "linear_identities_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_identities" ADD CONSTRAINT "linear_identities_workspace_fk" FOREIGN KEY ("server_id","workspace_id") REFERENCES "public"."linear_workspaces"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_identities" ADD CONSTRAINT "linear_identities_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_oauth_attempts" ADD CONSTRAINT "linear_oauth_attempts_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_oauth_attempts" ADD CONSTRAINT "linear_oauth_attempts_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_oauth_attempts" ADD CONSTRAINT "linear_oauth_attempts_connection_fk" FOREIGN KEY ("server_id","connection_id") REFERENCES "public"."mcp_connections"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_oauth_attempts" ADD CONSTRAINT "linear_oauth_attempts_identity_fk" FOREIGN KEY ("server_id","identity_id") REFERENCES "public"."linear_identities"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_workspaces" ADD CONSTRAINT "linear_workspaces_bound_by_user_id_users_id_fk" FOREIGN KEY ("bound_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_workspaces" ADD CONSTRAINT "linear_workspaces_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_workspaces" ADD CONSTRAINT "linear_workspaces_connection_fk" FOREIGN KEY ("server_id","connection_id") REFERENCES "public"."mcp_connections"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_workspaces" ADD CONSTRAINT "linear_workspaces_default_agent_fk" FOREIGN KEY ("server_id","default_agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_labels" ADD CONSTRAINT "linear_agent_labels_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_labels" ADD CONSTRAINT "linear_agent_labels_workspace_fk" FOREIGN KEY ("server_id","workspace_id") REFERENCES "public"."linear_workspaces"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_labels" ADD CONSTRAINT "linear_agent_labels_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_label_groups" ADD CONSTRAINT "linear_label_groups_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_label_groups" ADD CONSTRAINT "linear_label_groups_workspace_fk" FOREIGN KEY ("server_id","workspace_id") REFERENCES "public"."linear_workspaces"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_trigger_configs" ADD CONSTRAINT "linear_trigger_configs_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_trigger_configs" ADD CONSTRAINT "linear_trigger_configs_trigger_fk" FOREIGN KEY ("server_id","trigger_id") REFERENCES "public"."triggers"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_trigger_configs" ADD CONSTRAINT "linear_trigger_configs_workspace_fk" FOREIGN KEY ("server_id","workspace_id") REFERENCES "public"."linear_workspaces"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_writes" ADD CONSTRAINT "linear_writes_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_writes" ADD CONSTRAINT "linear_writes_workspace_fk" FOREIGN KEY ("server_id","workspace_id") REFERENCES "public"."linear_workspaces"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_writes" ADD CONSTRAINT "linear_writes_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_credentials" ADD CONSTRAINT "linear_credentials_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_credentials" ADD CONSTRAINT "linear_credentials_workspace_fk" FOREIGN KEY ("server_id","workspace_id") REFERENCES "public"."linear_workspaces"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_credentials" ADD CONSTRAINT "linear_credentials_identity_fk" FOREIGN KEY ("server_id","workspace_id","identity_id") REFERENCES "public"."linear_identities"("server_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_identity_secrets" ADD CONSTRAINT "linear_identity_secrets_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_identity_secrets" ADD CONSTRAINT "linear_identity_secrets_identity_fk" FOREIGN KEY ("server_id","identity_id") REFERENCES "public"."linear_identities"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_team_access" ADD CONSTRAINT "linear_team_access_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_team_access" ADD CONSTRAINT "linear_team_access_credential_fk" FOREIGN KEY ("server_id","credential_id") REFERENCES "public"."linear_credentials"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_sessions" ADD CONSTRAINT "linear_agent_sessions_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_sessions" ADD CONSTRAINT "linear_agent_sessions_workspace_fk" FOREIGN KEY ("server_id","workspace_id") REFERENCES "public"."linear_workspaces"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_sessions" ADD CONSTRAINT "linear_agent_sessions_identity_fk" FOREIGN KEY ("server_id","workspace_id","identity_id") REFERENCES "public"."linear_identities"("server_id","workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_agent_sessions" ADD CONSTRAINT "linear_agent_sessions_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_webhook_deliveries" ADD CONSTRAINT "linear_webhook_deliveries_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linear_webhook_deliveries" ADD CONSTRAINT "linear_webhook_deliveries_workspace_fk" FOREIGN KEY ("server_id","workspace_id") REFERENCES "public"."linear_workspaces"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "linear_identities_live_agent_key" ON "linear_identities" USING btree ("workspace_id","agent_id") WHERE "linear_identities"."status" <> 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "linear_identities_live_client_key" ON "linear_identities" USING btree ("oauth_client_id") WHERE "linear_identities"."status" <> 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "linear_identities_live_app_user_key" ON "linear_identities" USING btree ("organization_id","app_user_id") WHERE "linear_identities"."status" <> 'removed';--> statement-breakpoint
CREATE INDEX "linear_oauth_attempts_expires_idx" ON "linear_oauth_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_workspaces_live_organization_key" ON "linear_workspaces" USING btree ("organization_id") WHERE "linear_workspaces"."status" <> 'removed';--> statement-breakpoint
CREATE UNIQUE INDEX "linear_agent_labels_live_key" ON "linear_agent_labels" USING btree ("workspace_id","team_id","agent_id") WHERE "linear_agent_labels"."state" <> 'archived';--> statement-breakpoint
CREATE INDEX "linear_agent_labels_agent_idx" ON "linear_agent_labels" USING btree ("server_id","agent_id");--> statement-breakpoint
CREATE INDEX "linear_trigger_configs_workspace_idx" ON "linear_trigger_configs" USING btree ("server_id","workspace_id");--> statement-breakpoint
CREATE INDEX "linear_writes_correlation_idx" ON "linear_writes" USING btree ("workspace_id","result_entity_id","result_updated_at");--> statement-breakpoint
CREATE INDEX "linear_writes_created_idx" ON "linear_writes" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "linear_credentials_workspace_actor_key" ON "linear_credentials" USING btree ("workspace_id") WHERE "linear_credentials"."identity_id" is null;--> statement-breakpoint
CREATE INDEX "linear_agent_sessions_agent_idx" ON "linear_agent_sessions" USING btree ("server_id","agent_id","status");--> statement-breakpoint
CREATE INDEX "linear_webhook_deliveries_queue_idx" ON "linear_webhook_deliveries" USING btree ("state","next_attempt_at");--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_kind" CHECK ("triggers"."kind" in ('webhook', 'github', 'linear'));--> statement-breakpoint
-- Links inside the Server cascade are checked at commit, so a Server purge can delete in any order.
ALTER TABLE "linear_workspaces" ALTER CONSTRAINT "linear_workspaces_connection_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "linear_workspaces" ALTER CONSTRAINT "linear_workspaces_default_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "linear_identities" ALTER CONSTRAINT "linear_identities_workspace_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "linear_identities" ALTER CONSTRAINT "linear_identities_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "linear_agent_labels" ALTER CONSTRAINT "linear_agent_labels_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "linear_agent_sessions" ALTER CONSTRAINT "linear_agent_sessions_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "linear_writes" ALTER CONSTRAINT "linear_writes_agent_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "linear_trigger_configs" ALTER CONSTRAINT "linear_trigger_configs_workspace_fk" DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- Linear becomes a built-in connection served by a Server-hosted connector.
-- Existing hosted-MCP sign-ins keep working as custom MCP connections.
UPDATE "mcp_connections" SET "preset" = NULL WHERE "preset" = 'linear';