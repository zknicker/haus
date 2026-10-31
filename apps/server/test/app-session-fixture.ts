import { runtimeUserIdSchema } from '@haus/api';
import type { AppSession } from '@haus/api/app-session';
import { eq } from 'drizzle-orm';
import { createHausSessions } from '../src/identity/haus-sessions.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { usersTable, userVerifiedEmailsTable } from '../src/postgres/schema.ts';

export interface AppSessionFixtureInput {
    accessLifetimeSeconds?: number;
    databaseUrl: string;
    displayName?: string | null;
    subject: string;
    userId: string;
    verifiedEmails: readonly string[];
}

/** Mints a real opaque Server session for test-runner injection; never a public auth path. */
export async function createAppSessionFixture(input: AppSessionFixtureInput): Promise<{
    session: AppSession;
    sessionExpiresAt: string;
    sessionToken: string;
}> {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('App session fixtures are available only in NODE_ENV=test.');
    }
    assertLoopbackDatabase(input.databaseUrl);
    runtimeUserIdSchema.parse(input.userId);
    if (!input.subject || input.subject.length > 512) {
        throw new Error(
            'App session fixture subject must be a non-empty string under 512 characters.'
        );
    }
    const lifetimeSeconds = input.accessLifetimeSeconds ?? 60;
    if (!Number.isInteger(lifetimeSeconds) || lifetimeSeconds < 1 || lifetimeSeconds > 3600) {
        throw new Error('App session fixture lifetime must be between 1 and 3600 seconds.');
    }
    const verifiedEmails = [...new Set(input.verifiedEmails.map(normalizeEmail))];

    const connection = await connectHausDatabase(input.databaseUrl);
    try {
        const email = verifiedEmails[0] ?? null;
        await connection.db
            .insert(usersTable)
            .values({
                authSubject: input.subject,
                displayName: input.displayName ?? null,
                email,
                id: input.userId,
            })
            .onConflictDoNothing();
        const [user] = await connection.db
            .select({ authSubject: usersTable.authSubject, id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, input.userId))
            .limit(1);
        if (!user || user.authSubject !== input.subject) {
            throw new Error('App session fixture user id is already bound to another identity.');
        }

        for (const verifiedEmail of verifiedEmails) {
            await connection.db
                .insert(userVerifiedEmailsTable)
                .values({ email: verifiedEmail, userId: input.userId })
                .onConflictDoNothing({ target: userVerifiedEmailsTable.email });
            const [owner] = await connection.db
                .select({ userId: userVerifiedEmailsTable.userId })
                .from(userVerifiedEmailsTable)
                .where(eq(userVerifiedEmailsTable.email, verifiedEmail))
                .limit(1);
            if (owner?.userId !== input.userId) {
                throw new Error(`App session fixture email ${verifiedEmail} is already linked.`);
            }
        }

        const issued = await createHausSessions(connection.db, {
            accessLifetimeMs: lifetimeSeconds * 1000,
        }).issueDevelopment(input.userId, input.subject);
        return {
            session: issued.appSession,
            sessionExpiresAt: issued.sessionExpiresAt,
            sessionToken: issued.resumeToken,
        };
    } finally {
        await connection.close();
    }
}

function normalizeEmail(value: string) {
    const email = value.trim().toLowerCase();
    if (!email || email.length > 320 || !email.includes('@')) {
        throw new Error('App session fixture verified emails must be valid normalized addresses.');
    }
    return email;
}

function assertLoopbackDatabase(databaseUrl: string) {
    let hostname: string;
    try {
        hostname = new URL(databaseUrl).hostname;
    } catch {
        throw new Error('App session fixtures require a loopback PostgreSQL test database.');
    }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
        throw new Error('App session fixtures require a loopback PostgreSQL test database.');
    }
}
