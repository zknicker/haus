CREATE TABLE "boot_steps" (
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_session_rotations" DROP CONSTRAINT "agent_session_rotations_reason";--> statement-breakpoint
ALTER TABLE "agent_session_rotations" ADD CONSTRAINT "agent_session_rotations_reason" CHECK ("agent_session_rotations"."reason" in ('configuration', 'full', 'recovery', 'runner', 'session'));