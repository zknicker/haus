CREATE TABLE "image_generation_keys" (
	"provider" text NOT NULL,
	"secret" jsonb NOT NULL,
	"server_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_generation_keys_pkey" PRIMARY KEY("server_id","provider"),
	CONSTRAINT "image_generation_keys_provider" CHECK ("image_generation_keys"."provider" in ('openai', 'gemini'))
);
--> statement-breakpoint
CREATE TABLE "image_generation_links" (
	"chat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "image_generation_links_pkey" PRIMARY KEY("server_id","message_id","generation_id"),
	CONSTRAINT "image_generation_links_ordinal" CHECK ("image_generation_links"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "image_generations" (
	"agent_id" text NOT NULL,
	"attachment_id" text,
	"computer_id" text NOT NULL,
	"cost_basis" text,
	"cost_usd" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"error_code" text,
	"failure_reason" text,
	"height" integer,
	"id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"model_display_name" text NOT NULL,
	"nonce" text NOT NULL,
	"prompt" text NOT NULL,
	"provider" text NOT NULL,
	"request" jsonb NOT NULL,
	"resolution" text,
	"server_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"width" integer,
	CONSTRAINT "image_generations_server_id_key" UNIQUE("server_id","id"),
	CONSTRAINT "image_generations_nonce_key" UNIQUE("server_id","agent_id","nonce"),
	CONSTRAINT "image_generations_id_shape" CHECK ("image_generations"."id" ~ '^img_[A-Za-z0-9_-]{16}$'),
	CONSTRAINT "image_generations_provider" CHECK ("image_generations"."provider" in ('openai', 'gemini')),
	CONSTRAINT "image_generations_state" CHECK ("image_generations"."state" in ('pending', 'generating', 'ready', 'failed')),
	CONSTRAINT "image_generations_resolution" CHECK ("image_generations"."resolution" is null or "image_generations"."resolution" in ('1K', '2K', '4K')),
	CONSTRAINT "image_generations_cost_basis" CHECK ("image_generations"."cost_basis" is null or "image_generations"."cost_basis" in ('usage', 'estimate')),
	CONSTRAINT "image_generations_cost_pair" CHECK (("image_generations"."cost_usd" is null) = ("image_generations"."cost_basis" is null)),
	CONSTRAINT "image_generations_cost_usd" CHECK ("image_generations"."cost_usd" is null or "image_generations"."cost_usd" >= 0),
	CONSTRAINT "image_generations_prompt_length" CHECK (char_length("image_generations"."prompt") between 1 and 8000),
	CONSTRAINT "image_generations_ready_shape" CHECK (("image_generations"."state" = 'ready') = (num_nonnulls(
                "image_generations"."attachment_id", "image_generations"."width", "image_generations"."height", "image_generations"."resolution",
                "image_generations"."duration_ms", "image_generations"."cost_usd"
            ) = 6)
            and ("image_generations"."state" = 'ready' or num_nonnulls(
                "image_generations"."attachment_id", "image_generations"."width", "image_generations"."height", "image_generations"."resolution"
            ) = 0)),
	CONSTRAINT "image_generations_failed_shape" CHECK (("image_generations"."state" = 'failed') = (num_nonnulls("image_generations"."error_code", "image_generations"."failure_reason") = 2)
            and ("image_generations"."state" = 'failed' or num_nonnulls("image_generations"."error_code", "image_generations"."failure_reason") = 0))
);
--> statement-breakpoint
ALTER TABLE "image_generation_keys" ADD CONSTRAINT "image_generation_keys_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_generation_links" ADD CONSTRAINT "image_generation_links_generation_fk" FOREIGN KEY ("server_id","generation_id") REFERENCES "public"."image_generations"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_generation_links" ADD CONSTRAINT "image_generation_links_message_fk" FOREIGN KEY ("server_id","chat_id","message_id") REFERENCES "public"."chat_messages"("server_id","chat_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_generations" ADD CONSTRAINT "image_generations_agent_fk" FOREIGN KEY ("server_id","agent_id") REFERENCES "public"."agents"("server_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_generation_links_generation_idx" ON "image_generation_links" USING btree ("server_id","generation_id","created_at" DESC NULLS LAST,"message_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "image_generation_links_chat_idx" ON "image_generation_links" USING btree ("server_id","chat_id");--> statement-breakpoint
CREATE INDEX "image_generations_agent_idx" ON "image_generations" USING btree ("server_id","agent_id","created_at");--> statement-breakpoint
CREATE INDEX "image_generations_active_idx" ON "image_generations" USING btree ("server_id","created_at") WHERE "image_generations"."state" in ('pending', 'generating');--> statement-breakpoint
CREATE UNIQUE INDEX "image_generations_attachment_idx" ON "image_generations" USING btree ("server_id","attachment_id") WHERE "image_generations"."attachment_id" is not null;