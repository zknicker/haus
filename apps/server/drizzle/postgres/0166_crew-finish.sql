-- A crew Task's settled turn reaches its Captain as a content-free `crew_finish` item, and
-- `haus task report` is deleted with its `task_reports` table. Queued `crew_report` items have no
-- reader left, so they go with it; the source never reached production.
DELETE FROM "agent_inbox" WHERE "source" = 'crew_report';--> statement-breakpoint
DELETE FROM "agent_run_triggers" WHERE "source" = 'crew_report';--> statement-breakpoint
ALTER TABLE "task_reports" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "task_reports" CASCADE;--> statement-breakpoint
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_chat";--> statement-breakpoint
ALTER TABLE "agent_run_triggers" DROP CONSTRAINT "agent_run_triggers_chat";--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_chat" CHECK (("agent_inbox"."chat_id" is null) = ("agent_inbox"."source" in ('subagent', 'drive_conflict', 'process_exit', 'issue_assignment', 'issue_event', 'crew_finish')));--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat" CHECK (("agent_run_triggers"."chat_id" is null) = ("agent_run_triggers"."source" in ('subagent', 'drive_conflict', 'process_exit', 'issue_assignment', 'issue_event', 'crew_finish')));
