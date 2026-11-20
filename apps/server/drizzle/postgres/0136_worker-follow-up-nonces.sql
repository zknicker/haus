ALTER TABLE "worker_turns" ADD COLUMN IF NOT EXISTS "follow_up_nonces" text[] DEFAULT '{}'::text[] NOT NULL;
