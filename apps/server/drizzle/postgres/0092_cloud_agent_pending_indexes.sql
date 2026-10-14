DROP INDEX "cloud_agent_work_active_idx";--> statement-breakpoint
DROP INDEX "cloud_agent_work_computer_active_idx";--> statement-breakpoint
CREATE INDEX "cloud_agent_work_active_idx" ON "cloud_agent_work" USING btree ("server_id","created_at") WHERE "cloud_agent_work"."status" in ('queued', 'running', 'pending_input');--> statement-breakpoint
CREATE INDEX "cloud_agent_work_computer_active_idx" ON "cloud_agent_work" USING btree ("computer_id","created_at") WHERE "cloud_agent_work"."status" in ('queued', 'running', 'pending_input');