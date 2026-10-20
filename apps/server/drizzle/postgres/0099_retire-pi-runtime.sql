-- Pi is no longer a Haus execution runtime. Move every Agent configured on Pi to
-- the App's default for its Computer: Claude Code when the Computer reports it,
-- otherwise the first other runtime it reports, each with that runtime's first
-- model. A Computer with no usable report falls back to Claude Code's default
-- model. The reasoning effort is kept when the new model supports it and reset to
-- the model's default otherwise. Delivery rotates the session on the next turn
-- because the active run's runtime no longer matches.
WITH "targets" AS (
    SELECT
        "agents"."server_id",
        "agents"."id",
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
    WHERE "agents"."desired_runtime_id" = 'pi'
)
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
    END
FROM "targets"
WHERE "agents"."server_id" = "targets"."server_id"
    AND "agents"."id" = "targets"."id";
