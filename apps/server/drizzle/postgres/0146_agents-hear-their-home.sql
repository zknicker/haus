-- ADR 0055 and specs/projects.md, migration step 5: an Agent hears its Project
-- instead of the channels it joined. The Agents keep the Projects an earlier
-- migration gave them; each one's history there reads as seen, so the switch
-- does not mark a Project's whole backlog unread. The step runs only while
-- channel memberships still exist, so a replay changes nothing.
DO $$
DECLARE
    agent record;
BEGIN
    IF to_regclass('public.channel_agent_participants') IS NULL THEN
        RETURN;
    END IF;
    FOR agent IN
        SELECT candidate."id", candidate."server_id", candidate."handle",
            candidate."home_project_id" AS home,
            coalesce((
                SELECT string_agg('#' || joined."name", ' ' ORDER BY joined."name")
                FROM "channel_agent_participants" participant
                JOIN "chats" joined
                    ON joined."server_id" = participant."server_id"
                    AND joined."id" = participant."chat_id"
                WHERE participant."server_id" = candidate."server_id"
                    AND participant."agent_id" = candidate."id"
            ), '-') AS channels
        FROM "agents" candidate
        WHERE candidate."home_project_id" IS NOT NULL
        ORDER BY candidate."server_id", candidate."handle"
    LOOP
        INSERT INTO "agent_chat_reads" ("server_id", "agent_id", "chat_id", "sequence")
        SELECT heard."server_id", agent."id", heard."id", heard."last_message_sequence"
        FROM "chats" heard
        WHERE heard."server_id" = agent."server_id"
            AND heard."deleted_at" IS NULL
            AND (heard."id" = agent.home OR heard."parent_chat_id" = agent.home)
        ON CONFLICT DO NOTHING;
        RAISE NOTICE 'agents hear their project: @% joined % hears #%',
            agent."handle", agent.channels,
            (SELECT "name" FROM "chats" WHERE "server_id" = agent."server_id" AND "id" = agent.home);
    END LOOP;
END $$;--> statement-breakpoint
DROP TABLE IF EXISTS "agent_channel_mutes" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "channel_agent_participants" CASCADE;
