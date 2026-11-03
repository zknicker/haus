BEGIN;

DO $$
BEGIN
    IF to_regclass('drizzle.__drizzle_migrations') IS NULL THEN
        RAISE EXCEPTION 'Haus migration history is missing; auth rollback cannot be verified';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = 1793420400000
    ) THEN
        RAISE EXCEPTION 'Migration 0102 is not recorded as applied; do not restore its legacy schema';
    END IF;
    IF EXISTS (
        SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at > 1793420400000
    ) THEN
        RAISE EXCEPTION 'Later Haus migrations are applied; restore their schema changes before auth rollback';
    END IF;
    IF to_regclass('public.haus_auth_rollback_recovery') IS NULL THEN
        RAISE EXCEPTION 'Haus auth rollback map is missing; do not activate the old artifact';
    END IF;
    IF EXISTS (
        SELECT 1 FROM users
        WHERE NOT EXISTS (
            SELECT 1 FROM haus_auth_rollback_recovery AS recovery
            WHERE recovery.user_id = users.id
        )
    ) THEN
        RAISE EXCEPTION 'A Haus user has no legacy identity mapping; old Clerk auth cannot be restored';
    END IF;
    IF EXISTS (
        SELECT 1 FROM computer_login_sessions AS sessions
        WHERE NOT EXISTS (
            SELECT 1 FROM haus_auth_rollback_recovery AS recovery
            WHERE recovery.user_id = sessions.user_id
        )
    ) OR EXISTS (
        SELECT 1 FROM computer_login_grants AS grants
        WHERE (grants.approved_by_user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM haus_auth_rollback_recovery AS recovery
            WHERE recovery.user_id = grants.approved_by_user_id
        )) OR (grants.denied_by_user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM haus_auth_rollback_recovery AS recovery
            WHERE recovery.user_id = grants.denied_by_user_id
        ))
    ) THEN
        RAISE EXCEPTION 'A Computer login owner has no legacy identity mapping; old artifact cannot be restored';
    END IF;
END $$;

ALTER TABLE users ADD COLUMN clerk_user_id text;
UPDATE users AS users
SET clerk_user_id = recovery.legacy_subject
FROM haus_auth_rollback_recovery AS recovery
WHERE recovery.user_id = users.id;
ALTER TABLE users ALTER COLUMN clerk_user_id SET NOT NULL;
DROP INDEX users_auth_subject_key;
ALTER TABLE users DROP COLUMN auth_subject;
CREATE UNIQUE INDEX users_clerk_user_id_key ON users USING btree (clerk_user_id);

ALTER TABLE computer_login_grants
    ADD COLUMN approved_by_clerk_user_id text,
    ADD COLUMN denied_by_clerk_user_id text;
UPDATE computer_login_grants AS grants
SET approved_by_clerk_user_id = recovery.legacy_subject
FROM haus_auth_rollback_recovery AS recovery
WHERE recovery.user_id = grants.approved_by_user_id;
UPDATE computer_login_grants AS grants
SET denied_by_clerk_user_id = recovery.legacy_subject
FROM haus_auth_rollback_recovery AS recovery
WHERE recovery.user_id = grants.denied_by_user_id;
ALTER TABLE computer_login_sessions ADD COLUMN clerk_user_id text;
UPDATE computer_login_sessions AS sessions
SET clerk_user_id = recovery.legacy_subject
FROM haus_auth_rollback_recovery AS recovery
WHERE recovery.user_id = sessions.user_id;
ALTER TABLE computer_login_sessions ALTER COLUMN clerk_user_id SET NOT NULL;

ALTER TABLE computer_login_grants
    DROP CONSTRAINT computer_login_grants_approved_by_user_id_fkey,
    DROP CONSTRAINT computer_login_grants_denied_by_user_id_fkey,
    DROP COLUMN approved_by_user_id,
    DROP COLUMN denied_by_user_id;
ALTER TABLE computer_login_sessions
    DROP CONSTRAINT computer_login_sessions_user_id_fkey,
    DROP COLUMN user_id;
CREATE INDEX computer_login_sessions_owner_idx
    ON computer_login_sessions USING btree (clerk_user_id, created_at);

DROP TABLE user_verified_emails;
DROP TABLE haus_session_access_tokens;
DROP TABLE haus_sessions;
DROP TABLE browser_auth_intents;
DROP TABLE native_auth_intents;
DROP TABLE IF EXISTS haus_auth_identity_import_stage;

-- Migration 0102 is reversed above, so remove only its exact marker atomically.
DELETE FROM drizzle.__drizzle_migrations WHERE created_at = 1793420400000;

COMMIT;
