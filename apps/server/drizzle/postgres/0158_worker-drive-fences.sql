-- A Worker's push delete records its own author key, `worker:<id>`, as its puts do.
-- Each Worker turn keeps the Agent's reset generation from when it was dispatched, so a Full reset
-- fences that turn's Drive push. Turns already dispatched take the Agent's current generation.
ALTER TABLE "artifacts" DROP CONSTRAINT "artifacts_deleted_by_shape";--> statement-breakpoint
ALTER TABLE "worker_turns" ADD COLUMN "reset_generation" integer;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_deleted_by_shape" CHECK ("artifacts"."deleted_by" is null or "artifacts"."deleted_by" ~ '^(agent|user|worker):.+$');--> statement-breakpoint
DO $$
DECLARE
	bound integer;
BEGIN
	UPDATE "worker_turns" t
	SET "reset_generation" = a."reset_generation"
	FROM "workers" w
	JOIN "agents" a ON a."server_id" = w."server_id" AND a."id" = w."agent_id"
	WHERE w."server_id" = t."server_id"
		AND w."id" = t."worker_id"
		AND t."dispatched_at" IS NOT NULL
		AND t."reset_generation" IS NULL;
	GET DIAGNOSTICS bound = ROW_COUNT;
	RAISE NOTICE 'worker-drive-fences: % dispatched Worker turns took their Agent''s reset generation', bound;
END $$;
