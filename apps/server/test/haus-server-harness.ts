import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import type { WebSocket } from 'ws';
import type { InvocationClock } from '../src/agent-invocations/invocation-clock.ts';
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
import type { ImageProviderAdapters } from '../src/image-generation/run-image-generation.ts';
import type { MessageRouter } from '../src/message-routing/jev.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import type { PushSender } from '../src/push/push-sender.ts';
import { parseSecretsKey, type SecretsKey } from '../src/secrets/sealed-secret.ts';
import {
    startMigratedDatabase,
    startPostgresCluster,
    type TestDatabase,
} from './postgres-cluster.ts';
import { reportRunnerModels, testRunnerToken } from './runner.fixture.ts';
import { listRoutes } from './server-route-list.ts';
import { createTestHumanAuth, type TestHumanAuth } from './test-human-auth.ts';

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
    routes(): Array<{ method: string; url: string }>;
    sql: SQL;
    url: URL;
}

export const harnessAppOrigin = 'https://app.haus.test';
export const testSecretsKey = parseSecretsKey(Buffer.alloc(32, 11).toString('base64'));

export async function startHausServerHarness(
    options: {
        runnerToken?: string | null;
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
        invocationClock?: InvocationClock;
        /** The Haus GitHub App, usually over a faked GitHub transport. */
        githubApp?: GithubApp | null;
        enableDevelopmentAuth?: boolean;
        /** Fake image providers; image generation never reaches OpenAI or Gemini in tests. */
        imageGenerationAdapters?: ImageProviderAdapters;
        cloudflareAccess?: CloudflareAccessOptions;
        cloudflareOAuthMetadataFetch?: typeof fetch;
        /** Seals model connections; defaults to `testSecretsKey`, null runs without one. */
        secretsKey?: SecretsKey | null;
        /** Off unless a test asks, so other tests' Drive areas hold only what they wrote. */
        seedManagedSkills?: boolean;
    } = {}
): Promise<HausServerHarness> {
    const cluster = await startHarnessDatabase(options.postgresIcuLocale);
    const attachmentRoot = await mkdtemp(join(tmpdir(), 'haus-server-attachments-'));
    const appOrigin = options.appOrigin ?? harnessAppOrigin;
    let connection: Awaited<ReturnType<typeof connectHausDatabase>> | null = null;

    try {
        connection = await connectHausDatabase(cluster.databaseUrl);
        const sql = new SQL({ url: cluster.databaseUrl });
        const humans = createTestHumanAuth(connection.db, sql);
        let application: HausServerApplication | null = null;
        let registeredRoutes: Array<{ method: string; url: string }> = [];
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
            routes: () => registeredRoutes,
            sql,
            url: new URL('http://127.0.0.1'),
        };

        const runnerToken =
            options.runnerToken === null ? undefined : (options.runnerToken ?? testRunnerToken);
        const startApplication = async () => {
            const next = await createHausServerApplication({
                runnerToken,
                secretsKey: options.secretsKey === undefined ? testSecretsKey : options.secretsKey,
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
                seedManagedSkills: options.seedManagedSkills ?? false,
                databaseUrl: cluster.databaseUrl,
                pushSender: options.pushSender,
                pushReadGraceMs: options.pushReadGraceMs,
                openAiApiKey: options.openAiApiKey,
                connectLive: options.connectLive,
                computerSocketLiveness: options.computerSocketLiveness,
                invocationClock: options.invocationClock,
                githubApp: options.githubApp,
                imageGenerationAdapters: options.imageGenerationAdapters,
                // Tests drive GitHub delivery recovery directly, never on a timer.
                githubRecoveryIntervalMs: null,
                enableDevelopmentAuth: options.enableDevelopmentAuth,
            });
            registeredRoutes = listRoutes(next.app.printRoutes({ commonPrefix: false }));
            await next.app.listen({ host: '127.0.0.1', port: 0 });
            application = next;
            const { port } = next.app.server.address() as AddressInfo;
            harness.url = new URL(`http://127.0.0.1:${port}`);
            if (runnerToken === testRunnerToken) {
                await reportRunnerModels(harness);
            }
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

async function startHarnessDatabase(icuLocale: string | undefined): Promise<TestDatabase> {
    if (!icuLocale) {
        return startMigratedDatabase();
    }
    const cluster = await startPostgresCluster({ icuLocale });
    try {
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    } catch (error) {
        await cluster.stop();
        throw error;
    }
    return cluster;
}
