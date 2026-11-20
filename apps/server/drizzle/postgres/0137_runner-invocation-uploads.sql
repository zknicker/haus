ALTER TABLE "agent_invocation_payloads" ALTER COLUMN "invocation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_invocation_payloads" ADD COLUMN "agent_id" text;--> statement-breakpoint
ALTER TABLE "agent_invocation_payloads" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "agent_invocation_payloads" ADD COLUMN "seq" integer;--> statement-breakpoint
ALTER TABLE "agent_invocation_payloads" ADD COLUMN "tool_call_id" text;--> statement-breakpoint
ALTER TABLE "agent_invocation_payloads" ADD COLUMN "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_invocation_payloads_dispatch_key" ON "agent_invocation_payloads" USING btree ("server_id","agent_id","run_id","tool_call_id","seq");--> statement-breakpoint
ALTER TABLE "agent_invocation_payloads" ADD CONSTRAINT "agent_invocation_payloads_owner_shape" CHECK ("agent_invocation_payloads"."invocation_id" is not null or ("agent_invocation_payloads"."agent_id" is not null and "agent_invocation_payloads"."run_id" is not null and "agent_invocation_payloads"."tool_call_id" is not null and "agent_invocation_payloads"."seq" is not null));