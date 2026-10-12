ALTER TABLE "agent_delivery" DROP CONSTRAINT "agent_delivery_active_run";--> statement-breakpoint
ALTER TABLE "agent_inbox" ALTER COLUMN "chat_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ALTER COLUMN "chat_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runner_credentials" ALTER COLUMN "chat_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD CONSTRAINT "agent_delivery_active_run" CHECK ((
                "agent_delivery"."active_run_id" is null
                and "agent_delivery"."active_run_chat_id" is null
                and "agent_delivery"."active_run_computer_id" is null
                and "agent_delivery"."active_run_runtime_id" is null
                and "agent_delivery"."active_run_model_id" is null
                and "agent_delivery"."active_run_reasoning_effort" is null
                and "agent_delivery"."accepted_at" is null
                and "agent_delivery"."dispatched_at" is null
            ) or (
                "agent_delivery"."active_run_id" is not null
                and "agent_delivery"."active_run_computer_id" is not null
                and "agent_delivery"."active_run_runtime_id" is not null
                and "agent_delivery"."active_run_model_id" is not null
                and "agent_delivery"."active_run_reasoning_effort" is not null
            ));--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_chat" CHECK (("agent_inbox"."chat_id" is null) = ("agent_inbox"."source" = 'dream'));--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat" CHECK (("agent_run_triggers"."chat_id" is null) = ("agent_run_triggers"."source" = 'dream'));