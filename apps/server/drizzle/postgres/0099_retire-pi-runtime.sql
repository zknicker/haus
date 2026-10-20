-- Pi is no longer a Haus execution runtime. Move every Agent configured on Pi to
-- the App's default for its Computer: Claude Code when the Computer reports it,
-- otherwise the first other runtime it reports, each with that runtime's first
-- model. A Computer with no usable report falls back to Claude Code's default
-- model. The reasoning effort is kept when the new model supports it and reset to
-- the model's default otherwise.
--
-- The move mirrors a configuration change (`configureAgent`): an Agent without an
-- active run rotates its session now (generation + 1, drafts dropped, a
-- `configuration` rotation recorded), and a mid-run Agent rotates when that run
-- settles (`rotateDeferredConfiguration`). Either way the runtime change lifts any
-- failure hold or wake pause.
WITH "targets" AS (
    SELECT
        "agents"."server_id",
        "agents"."id",
        "agent_delivery"."active_run_id" IS NULL AS "rotate_now",
        COALESCE(
            (
                SELECT jsonb_build_object(
                    'runtime', "runtime"."value"->>'id',
                    'model', "runtime"."value"->'models'->0
                )
                FROM jsonb_array_elements(
                    CASE
                        WHEN jsonb_typeof("computers"."reported_inventory"->'runtimes') = 'array'
                        THEN "computers"."reported_inventory"->'runtimes'
                        ELSE '[]'::jsonb
                    END
                ) WITH ORDINALITY AS "runtime"("value", "position")
                WHERE "runtime"."value"->>'id' <> 'pi'
                    AND jsonb_typeof("runtime"."value"->'models') = 'array'
                    AND jsonb_array_length("runtime"."value"->'models') > 0
                ORDER BY ("runtime"."value"->>'id' = 'claude-code') DESC, "runtime"."position"
                LIMIT 1
            ),
            jsonb_build_object(
                'runtime', 'claude-code',
                'model', jsonb_build_object(
                    'id', 'claude-opus-4-8',
                    'defaultReasoningEffort', 'medium',
                    'reasoningEfforts', jsonb_build_array('low', 'medium', 'high', 'xhigh', 'max')
                )
            )
        ) AS "target"
    FROM "agents"
    LEFT JOIN "computers"
        ON "computers"."server_id" = "agents"."server_id"
        AND "computers"."id" = "agents"."computer_id"
    LEFT JOIN "agent_delivery"
        ON "agent_delivery"."agent_id" = "agents"."id"
    WHERE "agents"."desired_runtime_id" = 'pi'
),
"moved" AS (
    UPDATE "agents"
    SET
        "desired_runtime_id" = "targets"."target"->>'runtime',
        "desired_model_id" = "targets"."target"->'model'->>'id',
        "desired_reasoning_effort" = CASE
            WHEN COALESCE(jsonb_typeof("targets"."target"->'model'->'reasoningEfforts'), '') <> 'array'
                OR ("targets"."target"->'model'->'reasoningEfforts')
                    @> jsonb_build_array("agents"."desired_reasoning_effort")
            THEN "agents"."desired_reasoning_effort"
            ELSE COALESCE("targets"."target"->'model'->>'defaultReasoningEffort', 'medium')
        END,
        "session_generation" = CASE
            WHEN "targets"."rotate_now" THEN "agents"."session_generation" + 1
            ELSE "agents"."session_generation"
        END,
        "session_reset_kind" = CASE
            WHEN "targets"."rotate_now" THEN 'session'
            ELSE "agents"."session_reset_kind"
        END
    FROM "targets"
    WHERE "agents"."server_id" = "targets"."server_id"
        AND "agents"."id" = "targets"."id"
    RETURNING
        "agents"."server_id",
        "agents"."id",
        "agents"."created_at",
        "agents"."session_generation",
        "targets"."rotate_now"
),
"dropped_drafts" AS (
    DELETE FROM "agent_message_drafts"
    USING "moved"
    WHERE "agent_message_drafts"."agent_id" = "moved"."id"
        AND "moved"."rotate_now"
),
"released_holds" AS (
    UPDATE "agent_delivery"
    SET
        "consecutive_failures" = 0,
        "failure_fingerprint" = NULL,
        "last_failure_at" = NULL,
        "last_failure_code" = NULL,
        "last_failure_kind" = NULL,
        "paused_at" = NULL,
        "pause_step" = NULL,
        "retry_after" = NULL,
        "same_failure_streak" = 0,
        "updated_at" = now()
    FROM "moved"
    WHERE "agent_delivery"."agent_id" = "moved"."id"
)
INSERT INTO "agent_session_rotations"
    ("server_id", "agent_id", "generation", "previous_started_at", "reason", "rotated_at")
SELECT
    "moved"."server_id",
    "moved"."id",
    "moved"."session_generation",
    COALESCE(
        (
            SELECT "previous"."rotated_at"
            FROM "agent_session_rotations" AS "previous"
            WHERE "previous"."server_id" = "moved"."server_id"
                AND "previous"."agent_id" = "moved"."id"
                AND "previous"."generation" < "moved"."session_generation"
            ORDER BY "previous"."generation" DESC
            LIMIT 1
        ),
        "moved"."created_at"
    ),
    'configuration',
    now()
FROM "moved"
WHERE "moved"."rotate_now"
ON CONFLICT DO NOTHING;
