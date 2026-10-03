ALTER TABLE "agents" ADD COLUMN "creation_nonce" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "creation_request_hash" text;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_creation_nonce_key" UNIQUE("server_id","created_by_agent_id","creation_nonce");--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_creation_request" CHECK (("agents"."creation_nonce" is null and "agents"."creation_request_hash" is null)
                or ("agents"."created_by_agent_id" is not null and "agents"."creation_nonce" is not null
                    and "agents"."creation_request_hash" is not null));