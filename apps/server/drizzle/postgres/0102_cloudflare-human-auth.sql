-- The small identity import is staged on the legacy schema before deploy.
-- Existing users must all be explicitly mapped before Clerk ids can be removed.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users) THEN
        IF to_regclass('public.haus_auth_identity_import_stage') IS NULL THEN
            RAISE EXCEPTION 'Haus identity import must be staged before Cloudflare auth migration';
        END IF;
        IF (SELECT count(*) FROM haus_auth_identity_import_stage) <> (SELECT count(*) FROM users) THEN
            RAISE EXCEPTION 'Haus identity import must map every existing user';
        END IF;
        IF EXISTS (
            SELECT 1
            FROM users
            WHERE NOT EXISTS (
                SELECT 1
                FROM haus_auth_identity_import_stage AS staged
                WHERE staged.user_id = users.id
                  AND staged.legacy_subject = users.clerk_user_id
            )
        ) THEN
            RAISE EXCEPTION 'Haus identity import does not match every existing user and legacy subject';
        END IF;
    END IF;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS haus_auth_rollback_recovery (
    user_id text PRIMARY KEY,
    legacy_subject text NOT NULL UNIQUE,
    identity_subject text NOT NULL UNIQUE
);--> statement-breakpoint
DO $$
BEGIN
    IF to_regclass('public.haus_auth_identity_import_stage') IS NOT NULL THEN
        INSERT INTO haus_auth_rollback_recovery (user_id, legacy_subject, identity_subject)
        SELECT user_id, legacy_subject, subject
        FROM haus_auth_identity_import_stage
        ON CONFLICT (user_id) DO UPDATE
        SET legacy_subject = EXCLUDED.legacy_subject,
            identity_subject = EXCLUDED.identity_subject;
    END IF;
END $$;--> statement-breakpoint

ALTER TABLE computer_login_grants ADD COLUMN approved_by_user_id text;--> statement-breakpoint
ALTER TABLE computer_login_grants ADD COLUMN denied_by_user_id text;--> statement-breakpoint
UPDATE computer_login_grants AS grants
SET approved_by_user_id = users.id
FROM users
WHERE users.clerk_user_id = grants.approved_by_clerk_user_id;--> statement-breakpoint
UPDATE computer_login_grants AS grants
SET denied_by_user_id = users.id
FROM users
WHERE users.clerk_user_id = grants.denied_by_clerk_user_id;--> statement-breakpoint
ALTER TABLE computer_login_sessions ADD COLUMN user_id text;--> statement-breakpoint
UPDATE computer_login_sessions AS sessions
SET user_id = users.id
FROM users
WHERE users.clerk_user_id = sessions.clerk_user_id;--> statement-breakpoint

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM computer_login_grants
        WHERE approved_by_clerk_user_id IS NOT NULL AND approved_by_user_id IS NULL
    ) OR EXISTS (
        SELECT 1 FROM computer_login_grants
        WHERE denied_by_clerk_user_id IS NOT NULL AND denied_by_user_id IS NULL
    ) OR EXISTS (
        SELECT 1 FROM computer_login_sessions WHERE user_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Computer login owner migration found an unresolved legacy Clerk identity';
    END IF;
END $$;--> statement-breakpoint

ALTER TABLE computer_login_grants
    ADD CONSTRAINT computer_login_grants_approved_by_user_id_fkey
        FOREIGN KEY (approved_by_user_id) REFERENCES users(id),
    ADD CONSTRAINT computer_login_grants_denied_by_user_id_fkey
        FOREIGN KEY (denied_by_user_id) REFERENCES users(id);--> statement-breakpoint
ALTER TABLE computer_login_sessions
    ALTER COLUMN user_id SET NOT NULL,
    ADD CONSTRAINT computer_login_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);--> statement-breakpoint
DROP INDEX computer_login_sessions_owner_idx;--> statement-breakpoint
ALTER TABLE computer_login_grants
    DROP COLUMN approved_by_clerk_user_id,
    DROP COLUMN denied_by_clerk_user_id;--> statement-breakpoint
ALTER TABLE computer_login_sessions DROP COLUMN clerk_user_id;--> statement-breakpoint
CREATE INDEX computer_login_sessions_owner_idx ON computer_login_sessions USING btree (user_id, created_at);--> statement-breakpoint

ALTER TABLE users RENAME COLUMN clerk_user_id TO auth_subject;--> statement-breakpoint
ALTER INDEX users_clerk_user_id_key RENAME TO users_auth_subject_key;--> statement-breakpoint
DO $$
BEGIN
    IF to_regclass('public.haus_auth_identity_import_stage') IS NOT NULL THEN
        UPDATE users
SET auth_subject = staged.subject
        FROM haus_auth_identity_import_stage AS staged
        WHERE users.id = staged.user_id;
    END IF;
END $$;--> statement-breakpoint

CREATE TABLE user_verified_emails (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email text NOT NULL,
    verified_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_verified_emails_email_normalized CHECK (email = lower(btrim(email))),
    CONSTRAINT user_verified_emails_pkey PRIMARY KEY (user_id, email)
);--> statement-breakpoint
CREATE UNIQUE INDEX user_verified_emails_email_key ON user_verified_emails USING btree (email);--> statement-breakpoint
DO $$
BEGIN
    IF to_regclass('public.haus_auth_identity_import_stage') IS NOT NULL THEN
        INSERT INTO user_verified_emails (user_id, email)
        SELECT staged.user_id, lower(btrim(emails.email))
        FROM haus_auth_identity_import_stage AS staged
        CROSS JOIN LATERAL unnest(staged.verified_emails) AS emails(email);
    END IF;
END $$;--> statement-breakpoint
CREATE TABLE haus_sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    identity_subject text NOT NULL,
    resume_token_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    CONSTRAINT haus_sessions_id_shape CHECK (id ~ '^has_[A-Za-z0-9_-]{16}$'),
    CONSTRAINT haus_sessions_resume_token_hash_shape CHECK (resume_token_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT haus_sessions_expiry_order CHECK (expires_at > created_at),
    CONSTRAINT haus_sessions_maximum_lifetime CHECK (expires_at <= created_at + interval '14 days')
);--> statement-breakpoint
CREATE UNIQUE INDEX haus_sessions_resume_token_hash_key ON haus_sessions USING btree (resume_token_hash);--> statement-breakpoint
CREATE INDEX haus_sessions_user_created_idx ON haus_sessions USING btree (user_id, created_at);--> statement-breakpoint
CREATE INDEX haus_sessions_identity_subject_idx ON haus_sessions USING btree (identity_subject);--> statement-breakpoint

CREATE TABLE haus_session_access_tokens (
    token_hash text PRIMARY KEY,
    session_id text NOT NULL REFERENCES haus_sessions(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    CONSTRAINT haus_session_access_tokens_token_hash_shape CHECK (token_hash ~ '^[a-f0-9]{64}$')
);--> statement-breakpoint
CREATE INDEX haus_session_access_tokens_session_expiry_idx ON haus_session_access_tokens USING btree (session_id, expires_at);--> statement-breakpoint

CREATE TABLE browser_auth_intents (
    state_hash text PRIMARY KEY,
    return_to text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CONSTRAINT browser_auth_intents_state_hash_shape CHECK (state_hash ~ '^[a-f0-9]{64}$')
);--> statement-breakpoint
CREATE INDEX browser_auth_intents_expiry_idx ON browser_auth_intents USING btree (expires_at);--> statement-breakpoint

CREATE TABLE native_auth_intents (
    state_hash text PRIMARY KEY,
    client text NOT NULL CHECK (client IN ('desktop', 'ios')),
    native_redirect_uri text NOT NULL,
    native_state text NOT NULL,
    code_challenge text NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CONSTRAINT native_auth_intents_state_hash_shape CHECK (state_hash ~ '^[a-f0-9]{64}$')
);--> statement-breakpoint
CREATE INDEX native_auth_intents_expiry_idx ON native_auth_intents USING btree (expires_at);--> statement-breakpoint
DROP TABLE IF EXISTS haus_auth_identity_import_stage;
