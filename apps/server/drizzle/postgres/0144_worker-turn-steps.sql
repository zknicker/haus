ALTER TABLE "worker_turns" ADD COLUMN IF NOT EXISTS "steps" jsonb;--> statement-breakpoint
ALTER TABLE "worker_turns" DROP CONSTRAINT IF EXISTS "worker_turns_steps_shape";--> statement-breakpoint
ALTER TABLE "worker_turns" ADD CONSTRAINT "worker_turns_steps_shape" CHECK ("worker_turns"."steps" is null or jsonb_typeof("worker_turns"."steps") = 'array');
