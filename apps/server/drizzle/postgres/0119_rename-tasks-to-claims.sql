-- ADR 0051: today's message tasks are claims, the Agent-only lock on a message.
-- The board Tasks product owns the task name, so the claim store, its labels
-- join, the per-Chat claim counter, and every constraint and index follow.
ALTER TABLE "message_tasks" RENAME TO "message_claims";--> statement-breakpoint
ALTER TABLE "message_task_labels" RENAME TO "message_claim_labels";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_server_id_message_id_pk" TO "message_claims_server_id_message_id_pk";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_chat_fk" TO "message_claims_chat_fk";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_message_fk" TO "message_claims_message_fk";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_thread_fk" TO "message_claims_thread_fk";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_creator_membership_fk" TO "message_claims_creator_membership_fk";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_creator_agent_fk" TO "message_claims_creator_agent_fk";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_assignee_agent_fk" TO "message_claims_assignee_agent_fk";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_creator_shape" TO "message_claims_creator_shape";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_positive_number" TO "message_claims_positive_number";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_positive_version" TO "message_claims_positive_version";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_status" TO "message_claims_status";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_priority" TO "message_claims_priority";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_origin" TO "message_claims_origin";--> statement-breakpoint
ALTER TABLE "message_claims" RENAME CONSTRAINT "message_tasks_claim_shape" TO "message_claims_claim_shape";--> statement-breakpoint
ALTER INDEX "message_tasks_chat_number_key" RENAME TO "message_claims_chat_number_key";--> statement-breakpoint
ALTER INDEX "message_tasks_chat_status_idx" RENAME TO "message_claims_chat_status_idx";--> statement-breakpoint
ALTER INDEX "message_tasks_open_claim_idx" RENAME TO "message_claims_open_claim_idx";--> statement-breakpoint
ALTER TABLE "message_claim_labels" RENAME CONSTRAINT "message_task_labels_server_id_message_id_label_id_pk" TO "message_claim_labels_server_id_message_id_label_id_pk";--> statement-breakpoint
ALTER TABLE "message_claim_labels" RENAME CONSTRAINT "message_task_labels_task_fk" TO "message_claim_labels_claim_fk";--> statement-breakpoint
ALTER TABLE "message_claim_labels" RENAME CONSTRAINT "message_task_labels_label_fk" TO "message_claim_labels_label_fk";--> statement-breakpoint
ALTER TABLE "chats" RENAME COLUMN "last_task_number" TO "last_claim_number";--> statement-breakpoint
ALTER TABLE "chats" RENAME CONSTRAINT "chats_nonnegative_task_number" TO "chats_nonnegative_claim_number";--> statement-breakpoint
-- Assignment deliveries keep their identity under the new source and key
-- prefix, so a queued handoff still drains and a settled turn still names it.
UPDATE "agent_inbox"
SET
    "source" = 'claim_assignment',
    "dedupe_key" = 'claim-assign:' || substr("dedupe_key", length('task-assign:') + 1),
    "content" = regexp_replace("content", '^\[Haus task assignment task=#', '[Haus claim assignment claim=#')
WHERE "source" = 'task_assignment';--> statement-breakpoint
UPDATE "agent_run_triggers"
SET
    "source" = 'claim_assignment',
    "work_id" = 'claim-assign:' || substr("work_id", length('task-assign:') + 1)
WHERE "source" = 'task_assignment';
