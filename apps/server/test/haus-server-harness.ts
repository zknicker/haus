import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { eq } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import type { ArtifactStorage } from '../src/artifacts/storage.ts';
import type {
    AvatarGenerationLogger,
    AvatarImageProvider,
} from '../src/avatar-generation/service.ts';
import type { ComputerSocketLivenessTiming } from '../src/computers/socket-liveness.ts';
import type { GithubApp } from '../src/github/github-app.ts';
import {
    createHausServerApplication,
    type HausServerApplication,
} from '../src/haus-server-application.ts';
import type { CloudflareAccessOptions } from '../src/identity/cloudflare-access.ts';
import { createHausSessions, hashHausToken } from '../src/identity/haus-sessions.ts';
import type { ImageProviderAdapters } from '../src/image-generation/run-image-generation.ts';
import type { MessageRouter } from '../src/message-routing/jev.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { usersTable, userVerifiedEmailsTable } from '../src/postgres/schema.ts';
import type { PushSender } from '../src/push/push-sender.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

export interface TestHumanAuth {
    mintExpiredSessionToken(subject: string): Promise<string>;
    mintSessionToken(
        subject: string,
        options?: { accessLifetimeSeconds?: number; newSession?: boolean }
    ): Promise<string>;
    setVerifiedEmails(subject: string, emails: string[]): void;
    userIdForSubject(subject: string): string;
}

/**
 * Boots the Haus Server against a throwaway PostgreSQL cluster and attachment root.
 * Tests speak its public tRPC surface over HTTP, and read
 * committed rows straight from PostgreSQL through `sql`.
 */
export interface HausServerHarness {
    appOrigin: string;
    attachmentRoot: string;
    close(): Promise<void>;
    databaseUrl: string;
    humans: TestHumanAuth;
    restart(): Promise<void>;
    sql: SQL;
    url: URL;
}

export const harnessAppOrigin = 'https://app.haus.test';

export async function startHausServerHarness(
    options: {
        appOrigin?: string;
        artifactStorage?: ArtifactStorage;
        artifactStorageBytes?: number;
        avatarGenerationLogger?: AvatarGenerationLogger;
        avatarImageProvider?: AvatarImageProvider;
        postgresIcuLocale?: string;
        messageRouter?: MessageRouter;
        pushSender?: PushSender;
        pushReadGraceMs?: number;
        openAiApiKey?: string;
        connectLive?: () => WebSocket;
        computerSocketLiveness?: ComputerSocketLivenessTiming;
        /** The Haus GitHub App, usually over a faked GitHub transport. */
        githubApp?: GithubApp | null;
        enableDevelopmentAuth?: boolean;
        /** Fake image providers; image generation never reaches OpenAI or Gemini in tests. */
        imageGenerationAdapters?: ImageProviderAdapters;
        cloudflareAccess?: CloudflareAccessOptions;
        cloudflareOAuthMetadataFetch?: typeof fetch;
    } = {}
): Promise<HausServerHarness> {
    const cluster: PostgresCluster = await startPostgresCluster({
        icuLocale: options.postgresIcuLocale,
    });
    const attachmentRoot = await mkdtemp(join(tmpdir(), 'haus-server-attachments-'));
    const appOrigin = options.appOrigin ?? harnessAppOrigin;
    let connection: Awaited<ReturnType<typeof connectHausDatabase>> | null = null;

    try {
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        connection = await connectHausDatabase(cluster.databaseUrl);
        const sql = new SQL({ url: cluster.databaseUrl });
        const humans = createTestHumanAuth(connection.db, sql);
        let application: HausServerApplication | null = null;
        const harness: HausServerHarness = {
            appOrigin,
            attachmentRoot,
            humans,
            close: async () => {
                await application?.close();
                application = null;
                await connection?.close();
                connection = null;
                await sql.close();
                await cluster.stop();
                await rm(attachmentRoot, { force: true, recursive: true });
            },
            databaseUrl: cluster.databaseUrl,
            restart: async () => {
                await application?.close();
                application = null;
                await startApplication();
            },
            sql,
            url: new URL('http://127.0.0.1'),
        };

        const startApplication = async () => {
            const next = await createHausServerApplication({
                appOrigin,
                ...(options.cloudflareAccess ? { cloudflareAccess: options.cloudflareAccess } : {}),
                ...(options.cloudflareOAuthMetadataFetch
                    ? { cloudflareOAuthMetadataFetch: options.cloudflareOAuthMetadataFetch }
                    : {}),
                messageRouter: options.messageRouter,
                avatarGenerationLogger: options.avatarGenerationLogger,
                avatarImageProvider: options.avatarImageProvider,
                attachmentRoot,
                artifactStorage: options.artifactStorage,
                artifactStorageBytes: options.artifactStorageBytes,
                databaseUrl: cluster.databaseUrl,
                pushSender: options.pushSender,
                pushReadGraceMs: options.pushReadGraceMs,
                openAiApiKey: options.openAiApiKey,
                connectLive: options.connectLive,
                computerSocketLiveness: options.computerSocketLiveness,
                githubApp: options.githubApp,
                imageGenerationAdapters: options.imageGenerationAdapters,
                // Tests drive GitHub delivery recovery directly, never on a timer.
                githubRecoveryIntervalMs: null,
                enableDevelopmentAuth: options.enableDevelopmentAuth,
            });
            await next.app.listen({ host: '127.0.0.1', port: 0 });
            application = next;
            const { port } = next.app.server.address() as AddressInfo;
            harness.url = new URL(`http://127.0.0.1:${port}`);
        };
        await startApplication();
        return harness;
    } catch (error) {
        await connection?.close();
        await cluster.stop();
        await rm(attachmentRoot, { force: true, recursive: true });
        throw error;
    }
}

function createTestHumanAuth(
    db: Awaited<ReturnType<typeof connectHausDatabase>>['db'],
    sql: SQL
): TestHumanAuth {
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

    return {
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
}

function normalizeEmail(value: string) {
    const email = value.trim().toLowerCase();
    if (!email.includes('@')) {
        throw new Error('Test verified emails must be non-empty email addresses.');
    }
    return email;
}
