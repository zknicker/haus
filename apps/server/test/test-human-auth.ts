import type { SQL } from 'bun';
import { eq } from 'drizzle-orm';
import { createHausSessions, hashHausToken } from '../src/identity/haus-sessions.ts';
import type { connectHausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { usersTable, userVerifiedEmailsTable } from '../src/postgres/schema.ts';

export interface TestHumanAuth {
    mintExpiredSessionToken(subject: string): Promise<string>;
    mintSessionToken(
        subject: string,
        options?: { accessLifetimeSeconds?: number; newSession?: boolean }
    ): Promise<string>;
    setVerifiedEmails(subject: string, emails: string[]): void;
    userIdForSubject(subject: string): string;
}

export function createTestHumanAuth(
    db: Awaited<ReturnType<typeof connectHausDatabase>>['db'],
    sql: SQL
) {
    const verifiedEmails = new Map<string, string[]>();
    const userIds = new Map<string, string>();
    const sessions = new Map<string, { resumeToken: string; userId: string }>();

    const ensureUser = async (subject: string) => {
        let userId = userIds.get(subject);
        if (!userId) {
            const [existing] = await db
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.authSubject, subject))
                .limit(1);
            userId = existing?.id;
            if (!userId) {
                const id = createOpaqueId('usr');
                await db
                    .insert(usersTable)
                    .values({
                        authSubject: subject,
                        email: verifiedEmails.get(subject)?.[0] ?? null,
                        id,
                    })
                    .onConflictDoNothing();
                const [created] = await db
                    .select({ id: usersTable.id })
                    .from(usersTable)
                    .where(eq(usersTable.authSubject, subject))
                    .limit(1);
                userId = created?.id;
                if (!userId) {
                    throw new Error('Test human identity could not be created.');
                }
            }
            userIds.set(subject, userId);
        }

        for (const email of verifiedEmails.get(subject) ?? []) {
            await db
                .insert(userVerifiedEmailsTable)
                .values({ email, userId })
                .onConflictDoNothing({ target: userVerifiedEmailsTable.email });
            const [owner] = await db
                .select({ userId: userVerifiedEmailsTable.userId })
                .from(userVerifiedEmailsTable)
                .where(eq(userVerifiedEmailsTable.email, email))
                .limit(1);
            if (owner?.userId !== userId) {
                throw new Error(`Test verified email ${email} belongs to another human.`);
            }
        }
        return userId;
    };

    const mint = async (
        subject: string,
        options: { accessLifetimeSeconds?: number; newSession?: boolean } = {}
    ) => {
        const lifetimeSeconds = options.accessLifetimeSeconds ?? 3600;
        if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > 3600) {
            throw new Error('Test session lifetime must be between one second and one hour.');
        }
        const userId = await ensureUser(subject);
        const sessionKey = options.newSession ? `${subject}:${crypto.randomUUID()}` : subject;
        const existing = sessions.get(sessionKey);
        const hausSessions = createHausSessions(db, {
            accessLifetimeMs: lifetimeSeconds * 1000,
        });
        const issued = existing
            ? await hausSessions.resumeDevelopment(userId, subject, existing.resumeToken)
            : await hausSessions.issueDevelopment(userId, subject);
        sessions.set(sessionKey, { resumeToken: issued.resumeToken, userId });
        return issued.appSession.accessToken;
    };

    const humans: TestHumanAuth = {
        async mintExpiredSessionToken(subject) {
            const accessToken = await mint(subject);
            await sql`
                UPDATE haus_session_access_tokens
                SET expires_at = now() - interval '1 second'
                WHERE token_hash = ${hashHausToken(accessToken)}
            `;
            return accessToken;
        },
        mintSessionToken: mint,
        setVerifiedEmails(subject, emails) {
            verifiedEmails.set(subject, [...new Set(emails.map(normalizeEmail))]);
        },
        userIdForSubject(subject) {
            const userId = userIds.get(subject);
            if (!userId) {
                throw new Error('Sign in the test human before reading its user id.');
            }
            return userId;
        },
    };
    return humans;
}

function normalizeEmail(value: string) {
    const email = value.trim().toLowerCase();
    if (!email.includes('@')) {
        throw new Error('Test verified emails must be non-empty email addresses.');
    }
    return email;
}
