ALTER TABLE "computers" ADD COLUMN "agent_access_scope" text DEFAULT 'selected' NOT NULL;--> statement-breakpoint
ALTER TABLE "computers" ADD CONSTRAINT "computers_agent_access_scope" CHECK ("computers"."agent_access_scope" in ('selected', 'all'));--> statement-breakpoint
-- ADR 0057, amended 2026-11-23, decision 5: computer use becomes one switch over Agent access.
-- A Device whose desktop set D was smaller than its access set A turns off; nobody widens.
DO $$
DECLARE
	device record;
	kept_on integer := 0;
	stayed_off integer := 0;
	turned_off integer := 0;
BEGIN
	FOR device IN
		WITH access AS (
			SELECT c."id" AS "computer_id", a."id" AS "agent_id"
			FROM "computers" c
			JOIN "agents" a ON a."server_id" = c."server_id" AND a."computer_id" = c."id"
			WHERE a."retired_at" IS NULL
			UNION
			SELECT g."computer_id", g."agent_id"
			FROM "computer_agent_access" g
			JOIN "agents" a ON a."server_id" = g."server_id" AND a."id" = g."agent_id"
			WHERE a."retired_at" IS NULL
		),
		desktop AS (
			SELECT x."computer_id", x."agent_id"
			FROM access x
			JOIN "computers" c ON c."id" = x."computer_id" AND c."computer_use_scope" = 'all'
			JOIN "agents" a ON a."id" = x."agent_id" AND a."computer_id" = c."id"
			UNION
			SELECT x."computer_id", x."agent_id"
			FROM access x
			JOIN "computers" c ON c."id" = x."computer_id" AND c."computer_use_scope" = 'named'
			JOIN "computer_use_agents" u ON u."computer_id" = x."computer_id" AND u."agent_id" = x."agent_id"
		)
		SELECT c."id", c."server_id", c."computer_use_enabled" AS "enabled",
			c."computer_use_scope" AS "scope",
			coalesce(c."reported_inventory"->>'name', c."id") AS "name",
			(SELECT count(*) FROM access x WHERE x."computer_id" = c."id") AS "access_count",
			(SELECT count(*) FROM desktop d WHERE d."computer_id" = c."id") AS "desktop_count"
		FROM "computers" c
		ORDER BY c."server_id", c."id"
	LOOP
		IF NOT device."enabled" THEN
			stayed_off := stayed_off + 1;
		ELSIF device."desktop_count" = device."access_count" THEN
			kept_on := kept_on + 1;
			RAISE NOTICE 'captain-access: % (%) stays on: computer use covered all % Captains with access (scope %)',
				device."name", device."id", device."access_count", device."scope";
		ELSE
			UPDATE "computers" SET "computer_use_enabled" = false, "computer_use_changed_at" = now()
			WHERE "id" = device."id";
			turned_off := turned_off + 1;
			RAISE NOTICE 'captain-access: % (%) turned off: computer use covered % of % Captains with access (scope %)',
				device."name", device."id", device."desktop_count", device."access_count", device."scope";
		END IF;
	END LOOP;
	RAISE NOTICE 'captain-access: computer use kept on %, turned off %, already off %',
		kept_on, turned_off, stayed_off;
END $$;--> statement-breakpoint
DROP TRIGGER "agents_computer_use_moved" ON "agents";--> statement-breakpoint
DROP FUNCTION "computer_use_agents_drop_moved"();--> statement-breakpoint
DROP TABLE "computer_use_agents" CASCADE;--> statement-breakpoint
ALTER TABLE "computers" DROP CONSTRAINT "computers_computer_use_scope";--> statement-breakpoint
ALTER TABLE "computers" DROP COLUMN "computer_use_scope";
