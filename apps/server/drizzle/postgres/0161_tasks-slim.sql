-- ADR 0062 step 2: a Task loses its state, priority, due date, labels, assignee, key and number,
-- and gains a short id and an archive time. A not-null short_id needs a value on every existing
-- row, so it is added with a random 8-character Crockford base32 default that is dropped at once.
ALTER TABLE "task_label_assignments" DROP CONSTRAINT "task_label_assignments_task_fk";--> statement-breakpoint
ALTER TABLE "task_label_assignments" DROP CONSTRAINT "task_label_assignments_label_fk";--> statement-breakpoint
DROP TABLE "task_label_assignments";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_key_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_membership_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_agent_fk";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_state";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_completed_at";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignee_shape";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_priority";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_positive_number";--> statement-breakpoint
DROP INDEX "tasks_key_number_key";--> statement-breakpoint
DROP INDEX "tasks_state_idx";--> statement-breakpoint
DROP INDEX "tasks_assignee_user_idx";--> statement-breakpoint
DROP INDEX "tasks_assignee_agent_idx";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "assignee_agent_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "assignee_user_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "completed_at";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "due_on";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "key_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "number";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "priority";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "state";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "short_id" text NOT NULL DEFAULT (
	substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + floor(random() * 32)::int, 1)
	|| substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + floor(random() * 32)::int, 1)
	|| substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + floor(random() * 32)::int, 1)
	|| substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + floor(random() * 32)::int, 1)
	|| substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + floor(random() * 32)::int, 1)
	|| substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + floor(random() * 32)::int, 1)
	|| substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + floor(random() * 32)::int, 1)
	|| substr('0123456789abcdefghjkmnpqrstvwxyz', 1 + floor(random() * 32)::int, 1)
);--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "short_id" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_short_id_key" ON "tasks" USING btree ("server_id","short_id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_short_id_shape" CHECK ("tasks"."short_id" ~ '^[0-9a-hjkmnp-tv-z]{8}$');
