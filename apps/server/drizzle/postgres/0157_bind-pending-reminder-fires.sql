-- ADR 0057 decision 7: a script fire pending before 0156 may already have been sent to its
-- Agent's Computer, so it counts as sent there and is fenced, never rerun, if the Agent leaves
-- that Computer while it is offline.
DO $$
DECLARE
	bound integer;
	pending integer;
BEGIN
	SELECT count(*) INTO pending FROM "reminder_agent_attention"
	WHERE "attention_kind" = 'reminder_script';
	RAISE NOTICE 'bind-pending-reminder-fires: % pending script fires', pending;
	UPDATE "reminder_agent_attention" r
	SET "dispatched_computer_id" = a."computer_id",
		"dispatched_placement_generation" = a."placement_generation"
	FROM "agents" a
	WHERE a."server_id" = r."server_id"
		AND a."id" = r."agent_id"
		AND a."computer_id" IS NOT NULL
		AND r."attention_kind" = 'reminder_script'
		AND r."dispatched_computer_id" IS NULL;
	GET DIAGNOSTICS bound = ROW_COUNT;
	RAISE NOTICE 'bind-pending-reminder-fires: bound % pending script fires to their Agent''s Computer', bound;
END $$;
