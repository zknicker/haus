-- A background process exit is a chatless inbox source, and another session's desktop lease is a refusal.
ALTER TABLE "agent_inbox" DROP CONSTRAINT "agent_inbox_chat";--> statement-breakpoint
ALTER TABLE "agent_invocations" DROP CONSTRAINT "agent_invocations_refusal";--> statement-breakpoint
ALTER TABLE "agent_run_triggers" DROP CONSTRAINT "agent_run_triggers_chat";--> statement-breakpoint
ALTER TABLE "agent_inbox" ADD CONSTRAINT "agent_inbox_chat" CHECK ("agent_inbox"."source" = 'task_assignment'
                or ("agent_inbox"."chat_id" is null) = ("agent_inbox"."source" in ('subagent', 'drive_conflict', 'process_exit')));--> statement-breakpoint
ALTER TABLE "agent_invocations" ADD CONSTRAINT "agent_invocations_refusal" CHECK ("agent_invocations"."refusal" is null or ("agent_invocations"."refusal" in ('not-found', 'no-access', 'moved', 'desktop-busy', 'off', 'not-listed', 'not-mac', 'offline', 'not-ready', 'locked', 'no-session', 'switched-out') and "agent_invocations"."state" = 'finished'));--> statement-breakpoint
ALTER TABLE "agent_run_triggers" ADD CONSTRAINT "agent_run_triggers_chat" CHECK ("agent_run_triggers"."source" = 'task_assignment'
                or ("agent_run_triggers"."chat_id" is null) = ("agent_run_triggers"."source" in ('subagent', 'drive_conflict', 'process_exit')));