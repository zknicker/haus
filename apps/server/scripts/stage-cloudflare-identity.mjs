import { readFile } from 'node:fs/promises';
import { SQL } from 'bun';
import { z } from 'zod';

const importSchema = z
    .object({
        legacySubject: z.string().regex(/^user_[A-Za-z0-9_-]{1,200}$/u),
        subject: z
            .string()
            .min(1)
            .max(256)
            .regex(/^[^\u0000-\u001f\u007f]+$/u),
        userId: z.string().regex(/^usr_[A-Za-z0-9_-]{16}$/u),
        verifiedEmails: z
            .array(z.string().email())
            .min(1)
            .refine((emails) => emails.every((email) => email === email.trim().toLowerCase()))
            .refine((emails) => new Set(emails).size === emails.length),
    })
    .strict();

const [mode, path, ...extra] = process.argv.slice(2);
if (!(['--check', '--stage'].includes(mode ?? '') && path) || extra.length > 0) {
    fail(
        'Usage: bun apps/server/scripts/stage-cloudflare-identity.mjs --check|--stage <mapping.json>'
    );
}

const databaseUrl = process.env.HAUS_DATABASE_MIGRATION_URL;
if (!databaseUrl) {
    fail('HAUS_DATABASE_MIGRATION_URL is required.');
}

let mapping;
try {
    mapping = importSchema.parse(JSON.parse(await readFile(path, 'utf8')));
} catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Invalid identity import.';
    fail(`Identity import JSON is invalid: ${message}`);
}

const database = new SQL({ max: 1, url: databaseUrl });
try {
    await database.begin(async (tx) => {
        await tx`LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE`;
        const users = await tx`SELECT id, clerk_user_id FROM users FOR UPDATE`;
        if (
            users.length !== 1 ||
            users[0]?.id !== mapping.userId ||
            users[0]?.clerk_user_id !== mapping.legacySubject
        ) {
            throw new Error(
                'The mapping must exactly match the one existing Haus user and legacy identity.'
            );
        }

        const [stage] =
            await tx`SELECT to_regclass('public.haus_auth_identity_import_stage') AS name`;
        if (mode === '--check') {
            if (stage?.name) {
                await assertStagedMapping(tx, mapping);
            }
            return;
        }

        if (!stage?.name) {
            await tx.unsafe(`
                CREATE TABLE haus_auth_identity_import_stage (
                    user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    legacy_subject text NOT NULL UNIQUE,
                    subject text NOT NULL UNIQUE,
                    verified_emails text[] NOT NULL CHECK (cardinality(verified_emails) > 0)
                )
            `);
        }
        const [existing] = await tx`
            SELECT user_id, legacy_subject, subject, verified_emails
            FROM haus_auth_identity_import_stage
        `;
        if (existing) {
            await assertStagedMapping(tx, mapping);
            return;
        }

        await tx`
            INSERT INTO haus_auth_identity_import_stage (
                user_id, legacy_subject, subject, verified_emails
            )
            VALUES (
                ${mapping.userId}, ${mapping.legacySubject}, ${mapping.subject},
                ${postgresTextArray(mapping.verifiedEmails)}::text[]
            )
        `;
    });
    console.log(
        mode === '--stage' ? 'Identity import staged.' : 'Identity import preflight passed.'
    );
} catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown PostgreSQL error.';
    fail(`Identity import ${mode === '--stage' ? 'stage' : 'preflight'} failed: ${message}`);
} finally {
    await database.close();
}

async function assertStagedMapping(tx, expected) {
    const rows = await tx`
        SELECT user_id, legacy_subject, subject, verified_emails
        FROM haus_auth_identity_import_stage
    `;
    const row = rows[0];
    const emails = row?.verified_emails;
    if (
        rows.length !== 1 ||
        row?.user_id !== expected.userId ||
        row?.legacy_subject !== expected.legacySubject ||
        row?.subject !== expected.subject ||
        !Array.isArray(emails) ||
        JSON.stringify(emails) !== JSON.stringify(expected.verifiedEmails)
    ) {
        throw new Error('The existing staged identity mapping differs from the supplied receipt.');
    }
}

function postgresTextArray(values) {
    return `{${values
        .map((value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
        .join(',')}}`;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}
