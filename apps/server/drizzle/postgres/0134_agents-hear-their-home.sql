-- ADR 0055 and specs/projects.md, migration steps 4 and 5: every Agent's home is
-- the live Project where it authored the most messages in the last 30 days, a
-- Task's messages counting toward its Project, the newest message breaking a tie.
-- Cove, and an Agent with no such messages, stay in the Haus project. The step
-- runs only while channel memberships still exist, so a replay changes nothing.
DO $$
DECLARE
    agent record;
BEGIN
    IF to_regclass('public.channel_agent_participants') IS NULL THEN
        RETURN;
    END IF;
    FOR agent IN
        WITH authored AS (
            SELECT message."server_id",
                message."author_agent_id" AS agent_id,
                CASE WHEN chat."kind" = 'task' THEN chat."parent_chat_id" ELSE chat."id" END
                    AS project_id,
                message."created_at"
            FROM "chat_messages" message
            JOIN "chats" chat
                ON chat."server_id" = message."server_id" AND chat."id" = message."chat_id"
            WHERE message."author_agent_id" IS NOT NULL
                AND chat."kind" IN ('channel', 'task')
                AND message."created_at" >= now() - interval '30 days'
        ),
        counted AS (
            SELECT authored."server_id", authored.agent_id, authored.project_id,
                count(*) AS messages, max(authored."created_at") AS newest
            FROM authored
            JOIN "projects" project
                ON project."server_id" = authored."server_id"
                AND project."chat_id" = authored.project_id
            JOIN "chats" channel
                ON channel."server_id" = project."server_id" AND channel."id" = project."chat_id"
            WHERE channel."archived_at" IS NULL AND channel."deleted_at" IS NULL
            GROUP BY authored."server_id", authored.agent_id, authored.project_id
        ),
        ranked AS (
            SELECT counted.*, row_number() OVER (
                PARTITION BY counted."server_id", counted.agent_id
                ORDER BY counted.messages DESC, counted.newest DESC, counted.project_id
            ) AS rank
            FROM counted
        )
        SELECT candidate."id", candidate."server_id", candidate."handle",
            CASE WHEN candidate."factory_kind" = 'cove' THEN haus."id"
                ELSE coalesce(best.project_id, haus."id") END AS home,
            coalesce((
                SELECT string_agg('#' || joined."name", ' ' ORDER BY joined."name")
                FROM "channel_agent_participants" participant
                JOIN "chats" joined
                    ON joined."server_id" = participant."server_id"
                    AND joined."id" = participant."chat_id"
                WHERE participant."server_id" = candidate."server_id"
                    AND participant."agent_id" = candidate."id"
            ), '-') AS channels,
            coalesce((
                SELECT string_agg(
                    '#' || counted_channel."name" || '=' || counted.messages, ' '
                    ORDER BY counted.messages DESC, counted_channel."name"
                )
                FROM counted
                JOIN "chats" counted_channel
                    ON counted_channel."server_id" = counted."server_id"
                    AND counted_channel."id" = counted.project_id
                WHERE counted."server_id" = candidate."server_id"
                    AND counted.agent_id = candidate."id"
            ), '-') AS counts
        FROM "agents" candidate
        JOIN "chats" haus ON haus."server_id" = candidate."server_id" AND haus."is_all"
        LEFT JOIN ranked best
            ON best."server_id" = candidate."server_id"
            AND best.agent_id = candidate."id"
            AND best.rank = 1
        ORDER BY candidate."server_id", candidate."handle"
    LOOP
        UPDATE "agents" SET "home_project_id" = agent.home
        WHERE "server_id" = agent."server_id" AND "id" = agent."id";
        -- History from before the Agent heard its home is not unread.
        INSERT INTO "agent_chat_reads" ("server_id", "agent_id", "chat_id", "sequence")
        SELECT heard."server_id", agent."id", heard."id", heard."last_message_sequence"
        FROM "chats" heard
        WHERE heard."server_id" = agent."server_id"
            AND heard."deleted_at" IS NULL
            AND (heard."id" = agent.home OR heard."parent_chat_id" = agent.home)
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'agents hear their home: @% channels % messages % home #%',
            agent."handle", agent.channels, agent.counts,
            (SELECT "name" FROM "chats" WHERE "server_id" = agent."server_id" AND "id" = agent.home);
    END LOOP;
END $$;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_channel_mutes" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "channel_agent_participants" CASCADE;
