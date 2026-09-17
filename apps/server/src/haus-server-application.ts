import cors from '@fastify/cors';
import { makeProcessTelemetryRelay, settle, tracePromise } from '@haus/effect';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { Effect, Exit, Scope } from 'effect';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAgentApiRoutes } from './agent-api/routes.ts';
import { AgentDelivery } from './agent-delivery/delivery.ts';
import { openAttachmentRoot } from './attachments/attachment-root.ts';
import { registerAttachmentRoutes } from './attachments/attachment-routes.ts';
import { reconcileAttachments } from './attachments/reconcile-attachments.ts';
import { AvatarImageService, OpenAiAvatarImageProvider } from './avatar-generation/index.ts';
import { registerAvatarRoutes } from './avatars/avatar-routes.ts';
import { purgeDeletedChannels } from './chats/channel-lifecycle.ts';
import { ComputerConnections } from './computers/connections.ts';
import { registerComputerRoutes } from './computers/routes.ts';
import { markAllComputersOffline } from './computers/service.ts';
import { startComputerAttachmentSocket } from './computers/socket.ts';
import { productionComputerManifestUrl } from './computers/update.ts';
import { createHausContextFactory } from './haus-api/context.ts';
import { hausRouter } from './haus-api/router.ts';
import { startHausWebSocketServer } from './haus-api/ws.ts';
import { registerHausHealth } from './haus-health.ts';
import { registerHausReleaseRoute } from './haus-release-route.ts';
import type { HausServerApplicationOptions } from './haus-server-options.ts';
import {
    type HausServerShutdownResources,
    makeHausServerShutdown,
} from './haus-server-shutdown.ts';
import { registerHausStaticApp } from './haus-static-app.ts';
import { createClerkSessions } from './identity/clerk-sessions.ts';
import { createClerkUsers } from './identity/clerk-users.ts';
import { isAllowedAppOrigin } from './origin.ts';
import { connectHausDatabase } from './postgres/connection.ts';
import { type ServerRecurringWork, startServerRecurringWork } from './recurring-work.ts';
import { startReminderRetentionSweep } from './reminders/retention-sweep.ts';
import { tickReminders } from './reminders/scheduler.ts';
import { makeMcpIconResolver } from './server-mcp/icons.ts';
import { registerMcpOAuthCallback } from './server-mcp/oauth-callback-route.ts';
import { McpOAuthRelay } from './server-mcp/oauth-relay.ts';
import { McpRuntime } from './server-mcp/runtime.ts';
import { ServerPostCommitWork } from './server-post-commit-work.ts';
import { makeServerRuntime } from './server-runtime.ts';
import { purgeDeletedServers } from './servers/delete-server.ts';
import { startStaleTaskSweep } from './tasks/close-stale-tasks.ts';
import { startTriggerRetentionSweep } from './triggers/retention-sweep.ts';
import { TriggerRateLimiter } from './triggers/trigger-rate-limit.ts';
import { registerTriggerRoutes } from './triggers/trigger-route.ts';

export type { HausServerApplicationOptions } from './haus-server-options.ts';
export interface HausServerApplication {
    app: FastifyInstance;
    close(): Promise<void>;
    /** Binds the Server's port, closing the application if the bind fails. */
    listen(port: number): Promise<void>;
}

/**
 * tRPC batches every procedure name into one path segment, so the App's opening
 * batch runs past Fastify's 100-character `maxParamLength` default and 404s
 * instead of routing — intermittently leaving whole destinations without data.
 */
export const hausFastifyOptions = {
    bodyLimit: 12 * 1024 * 1024,
    logger: false,
    routerOptions: { maxParamLength: 5000 },
} as const;

export async function createHausServerApplication(
    options: HausServerApplicationOptions
): Promise<HausServerApplication> {
    const runtime = makeServerRuntime({
        releaseId: options.releaseIdentity?.releaseId,
        serviceRevision: options.releaseIdentity?.sourceRevision,
        serviceVersion: options.releaseIdentity?.serverVersion,
    });
    const scope = await settle(runtime, Scope.make());
    const shutdown = await settle(runtime, makeHausServerShutdown());
    let haus: Awaited<ReturnType<typeof connectHausDatabase>> | null = null;
    let app: FastifyInstance | null = null;
    let recurringWork: ServerRecurringWork | null = null;
    let postCommitWork: ServerPostCommitWork | null = null;
    let mcpRuntime: McpRuntime | null = null;
    let computerSocket: ReturnType<typeof startComputerAttachmentSocket> | null = null;
    let webSocketServer: ReturnType<typeof startHausWebSocketServer> | null = null;
    const resources = {
        broadcastReconnectNotification: () => webSocketServer?.broadcastReconnectNotification(),
        closeComputerSocket: () => computerSocket?.close(),
        closeDatabase: async () => {
            await haus?.close();
        },
        closeFastify: async () => {
            await app?.close();
        },
        closeHttpConnections: () => app?.server.closeAllConnections(),
        closeMcpRuntime: async () => {
            await mcpRuntime?.close();
        },
        closePostCommitWork: async () => {
            await postCommitWork?.close();
        },
        closeRecurringWork: async () => {
            await recurringWork?.close();
        },
        closeWebSocketServer: () => webSocketServer?.close(),
    } satisfies HausServerShutdownResources;

    try {
        await settle(runtime, Scope.extend(shutdown.register(resources), scope));
        const connectedHaus = await connectHausDatabase(options.databaseUrl);
        haus = connectedHaus;
        const attachmentRoot = await openAttachmentRoot(options.attachmentRoot, runtime);
        await reconcileAttachments(connectedHaus.db, attachmentRoot);
        await purgeDeletedChannels(connectedHaus.db, attachmentRoot);
        await purgeDeletedServers(connectedHaus.db, attachmentRoot);
        await markAllComputersOffline(connectedHaus.db);
        const clerkSessions = createClerkSessions(options.clerkIssuerUrl, options.appOrigin);
        const computerConnections = new ComputerConnections(runtime);
        const agentDelivery = new AgentDelivery(connectedHaus.db, computerConnections, runtime);
        const startedPostCommitWork = new ServerPostCommitWork(runtime);
        postCommitWork = startedPostCommitWork;
        const avatarImageService = new AvatarImageService(
            options.avatarImageProvider ??
                new OpenAiAvatarImageProvider({ apiKey: options.openAiApiKey }),
            options.avatarGenerationLogger
        );
        const startedMcpRuntime = new McpRuntime(connectedHaus.db, runtime);
        mcpRuntime = startedMcpRuntime;
        const mcpIconResolver = makeMcpIconResolver(runtime);
        const mcpOAuthRelay = new McpOAuthRelay(connectedHaus.db, startedMcpRuntime);
        // One inbound budget per trigger, shared by the public route and the
        // operator's test fire: a test costs exactly what a real delivery does.
        const triggerRateLimiter = new TriggerRateLimiter();
        const createContext = createHausContextFactory({
            messageRouter: options.messageRouter,
            agentDelivery,
            appOrigin: options.appOrigin,
            attachmentRoot,
            avatarImageService,
            clerkSessions,
            clerkUsers:
                options.clerkUsers ??
                createClerkUsers({
                    apiUrl: options.clerkApiUrl,
                    secretKey: options.clerkSecretKey,
                }),
            computerConnections,
            computerReleaseManifestUrl:
                options.computerReleaseManifestUrl ?? productionComputerManifestUrl,
            hausDb: connectedHaus.db,
            mcpIconResolver,
            mcpOAuthRelay,
            mcpRuntime: startedMcpRuntime,
            postCommitWork: startedPostCommitWork,
            runtime,
            triggerRateLimiter,
        });
        const isAllowedOrigin = (origin: string | undefined) =>
            isAllowedAppOrigin(origin, options.appOrigin);

        const startedApp = Fastify(hausFastifyOptions);
        app = startedApp;

        await startedApp.register(cors, {
            credentials: true,
            methods: ['GET', 'HEAD', 'POST', 'PUT'],
            origin: (origin, callback) => {
                callback(null, isAllowedOrigin(origin));
            },
        });

        await registerAttachmentRoutes(startedApp, {
            clerkSessions,
            db: connectedHaus.db,
            root: attachmentRoot,
            runtime,
        });
        registerAvatarRoutes(startedApp, { db: connectedHaus.db });
        registerComputerRoutes(startedApp, {
            appOrigin: options.appOrigin,
            db: connectedHaus.db,
            telemetryRelay: makeProcessTelemetryRelay(),
        });
        registerAgentApiRoutes(startedApp, {
            agentDelivery,
            avatarImageService,
            attachmentRoot,
            computers: computerConnections,
            db: connectedHaus.db,
            mcpRuntime: startedMcpRuntime,
            postCommitWork: startedPostCommitWork,
        });
        registerMcpOAuthCallback(startedApp, mcpOAuthRelay);
        await registerTriggerRoutes(startedApp, {
            db: connectedHaus.db,
            delivery: agentDelivery,
            limiter: triggerRateLimiter,
            postCommitWork: startedPostCommitWork,
            runtime,
        });
        registerHausReleaseRoute(startedApp, { releaseIdentity: options.releaseIdentity });

        await startedApp.register(fastifyTRPCPlugin, {
            prefix: '/trpc',
            trpcOptions: {
                allowMethodOverride: true,
                createContext,
                router: hausRouter,
            },
        });

        const startedWebSocketServer = startHausWebSocketServer(startedApp.server, {
            createContext,
            isAllowedOrigin,
        });
        webSocketServer = startedWebSocketServer;
        const startedComputerSocket = startComputerAttachmentSocket(
            startedApp.server,
            connectedHaus.db,
            computerConnections,
            agentDelivery,
            startedPostCommitWork
        );
        computerSocket = startedComputerSocket;
        const reminderClock = options.reminderClock ?? { now: () => new Date() };
        for (const startSweep of [
            startReminderRetentionSweep,
            startTriggerRetentionSweep,
            startStaleTaskSweep,
        ]) {
            await settle(
                runtime,
                Scope.extend(
                    Effect.acquireRelease(
                        Effect.sync(() =>
                            startSweep(connectedHaus.db, reminderClock, options.sweepTimers)
                        ),
                        (sweep) => Effect.promise(() => sweep.close())
                    ),
                    scope
                )
            );
        }
        recurringWork = await startServerRecurringWork({
            delivery: agentDelivery,
            reminderClock,
            reminderTick: () => tickReminders(connectedHaus.db, reminderClock, agentDelivery),
            runtime,
        });
        registerHausHealth(startedApp, runtime, connectedHaus.health, 5000, () => {
            return (
                recurringWork?.reminderHealth() ?? {
                    consecutiveFailures: 1,
                    lastSuccessfulTickAt: null,
                    status: 'degraded' as const,
                }
            );
        });

        if (options.staticAppRoot) {
            await registerHausStaticApp(startedApp, options.staticAppRoot);
        }

        let closePromise: Promise<void> | null = null;
        const close = () => {
            closePromise ??= settle(runtime, shutdown.close(scope, Exit.succeed(undefined))).then(
                () => runtime.dispose(),
                async (cause) => {
                    await runtime.dispose().catch(() => undefined);
                    throw cause;
                }
            );
            return closePromise;
        };

        return {
            app: startedApp,
            close,
            listen: async (port) => {
                try {
                    await tracePromise(
                        runtime,
                        'haus.server.startup',
                        { 'haus.operation': 'server.startup' },
                        async () => startedApp.listen({ host: '127.0.0.1', port })
                    );
                } catch (cause) {
                    // A failed bind must not leave the application and pool open.
                    await close().catch(() => undefined);
                    throw cause;
                }
            },
        };
    } catch (cause) {
        // The original failure is the useful one; teardown must not mask it.
        await settle(runtime, shutdown.close(scope, Exit.fail(cause))).catch(() => undefined);
        await runtime.dispose().catch(() => undefined);
        throw cause;
    }
}
