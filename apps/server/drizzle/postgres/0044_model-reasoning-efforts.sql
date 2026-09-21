ALTER TABLE "agent_delivery" DROP CONSTRAINT "agent_delivery_active_run_reasoning_effort";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_reasoning_effort";--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_effective_reasoning_effort";--> statement-breakpoint
ALTER TABLE "agent_delivery" ADD CONSTRAINT "agent_delivery_active_run_reasoning_effort" CHECK ("agent_delivery"."active_run_reasoning_effort" is null or "agent_delivery"."active_run_reasoning_effort" in ('default', 'low', 'medium', 'high', 'xhigh', 'max'));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_reasoning_effort" CHECK ("agents"."desired_reasoning_effort" in ('default', 'low', 'medium', 'high', 'xhigh', 'max'));--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_effective_reasoning_effort" CHECK ("agents"."effective_reasoning_effort" is null or "agents"."effective_reasoning_effort" in ('default', 'low', 'medium', 'high', 'xhigh', 'max'));