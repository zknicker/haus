import cors from '@fastify/cors';
import { settle, tracePromise } from '@haus/effect';
import { Exit, Scope } from 'effect';
import Fastify, { type FastifyInstance } from 'fastify';
import { AgentDelivery } from './agent-delivery/delivery.ts';
import { openArtifactStorage } from './artifacts/startup.ts';
import { openAttachmentRoot } from './attachments/attachment-root.ts';
import { reconcileAttachments } from './attachments/reconcile-attachments.ts';
import { AvatarImageService, OpenAiAvatarImageProvider } from './avatar-generation/index.ts';
import { purgeDeletedChannels } from './chats/channel-lifecycle.ts';
import { ComputerConnections } from './computers/connections.ts';
import { markAllComputersOffline } from './computers/service.ts';
import { startComputerAttachmentSocket } from './computers/socket.ts';
import { productionComputerManifestUrl } from './computers/update.ts';
import { githubDeliveryIngest } from './github/deliveries.ts';
import { githubSignedInHook } from './github/installation-sweep.ts';
import { createHausContextFactory, type HausContextDependencies } from './haus-api/context.ts';
import { startHausWebSocketServer } from './haus-api/ws.ts';
import { hausFastifyOptions } from './haus-fastify-options.ts';
import { registerHausHealth } from './haus-health.ts';
import type { HausServerApplicationOptions } from './haus-server-options.ts';
import { registerHausServerRoutes } from './haus-server-routes.ts';
import {
    emptyHausServerHandles,
    hausServerShutdownResources,
    makeHausServerShutdown,
} from './haus-server-shutdown.ts';
import { registerHausStaticApp } from './haus-static-app.ts';
import { startHostedMcps } from './hosted-mcp/supervisor.ts';
import { createCloudflareAdmissions } from './identity/cloudflare-access.ts';
import { ensureDevelopmentAuthUser } from './identity/development-auth.ts';
import { createHausSessions } from './identity/haus-sessions.ts';
import { SessionConnections } from './identity/session-connections.ts';
import { createLinearServices } from './linear/linear-runtime.ts';
import { isAllowedAppOrigin } from './origin.ts';
import { connectHausDatabase } from './postgres/connection.ts';
import { startServerRecurringWork } from './recurring-work.ts';
import { tickReminders } from './reminders/scheduler.ts';
import { startMcpConnectionIconRepair } from './server-mcp/icon-repair.ts';
import { makeMcpIconResolver } from './server-mcp/icons.ts';
import { McpOAuthRelay } from './server-mcp/oauth-relay.ts';
import { McpRuntime } from './server-mcp/runtime.ts';
import { ServerPostCommitWork } from './server-post-commit-work.ts';
import { makeServerRuntime } from './server-runtime.ts';
import { startServerSweeps } from './server-sweeps.ts';
import { purgeDeletedServers } from './servers/delete-server.ts';
import { TriggerRateLimiter } from './triggers/trigger-rate-limit.ts';
import { startVoiceSocket } from './voice/voice-socket.ts';

export type { HausServerApplicationOptions } from './haus-server-options.ts';
export interface HausServerApplication {
    app: FastifyInstance;
    close(): Promise<void>;
    /** Binds the Server's port, closing the application if the bind fails. */
    listen(port: number): Promise<void>;
}

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
    const handles = emptyHausServerHandles();
    const hostedScope = await settle(runtime, Scope.make());
    const resources = hausServerShutdownResources(handles, () =>
        settle(runtime, Scope.close(hostedScope, Exit.succeed(undefined)))
    );

    try {
        await settle(runtime, Scope.extend(shutdown.register(resources), scope));
        const connectedHaus = await connectHausDatabase(options.databaseUrl);
        handles.haus = connectedHaus;
        const artifacts = await openArtifactStorage(options, connectedHaus.db, runtime, scope);
        const { artifactStorage } = artifacts;
        const attachmentRoot = await openAttachmentRoot(options.attachmentRoot, runtime);
        await reconcileAttachments(connectedHaus.db, attachmentRoot);
        await purgeDeletedChannels(connectedHaus.db, attachmentRoot);
        await purgeDeletedServers(connectedHaus.db, attachmentRoot, artifactStorage);
        await markAllComputersOffline(connectedHaus.db);
        const cloudflareAdmissions = createCloudflareAdmissions(options.cloudflareAccess);
        const hausSessions = createHausSessions(connectedHaus.db);
        const sessionConnections = new SessionConnections();
        const developmentAuth = options.enableDevelopmentAuth
            ? await ensureDevelopmentAuthUser(connectedHaus.db)
            : null;
        const computerConnections = new ComputerConnections(runtime);
        const agentDelivery = new AgentDelivery(connectedHaus.db, computerConnections, runtime);
        const startedPostCommitWork = new ServerPostCommitWork(runtime);
        handles.postCommitWork = startedPostCommitWork;
        const avatarImageService = new AvatarImageService(
            options.avatarImageProvider ??
                new OpenAiAvatarImageProvider({ apiKey: options.openAiApiKey }),
            options.avatarGenerationLogger
        );
        const hostedMcps = options.hostedMcps
            ? await startHostedMcps({ ...options.hostedMcps, runtime, scope: hostedScope })
            : undefined;
        // One inbound budget per trigger, shared by the public route, Linear fires,
        // and the operator's test fire: a test costs exactly what a real delivery does.
        const triggerRateLimiter = new TriggerRateLimiter();
        // One refresh owner per process: tools, chips, ingest, and the outbox share it.
        const linearServices = createLinearServices(options, {
            agentDelivery,
            db: connectedHaus.db,
            postCommitWork: startedPostCommitWork,
            runtime,
            triggerRateLimiter,
        });
        const { linear } = linearServices;
        const startedMcpRuntime = new McpRuntime(connectedHaus.db, runtime, {
            hostedMcps,
            toolCallTransports: new Map([['linear', linear.transport]]),
        });
        handles.mcpRuntime = startedMcpRuntime;
        void startedMcpRuntime.start();
        const mcpIconResolver = makeMcpIconResolver(runtime);
        // Background: reads never fetch icons, so stored rows missing branding recover here.
        startMcpConnectionIconRepair(connectedHaus.db, mcpIconResolver);
        const wakeAgents = (wakes: { agentId: string; serverId: string }[]) => {
            void startedPostCommitWork.wakeAgents(agentDelivery, wakes);
        };
        const mcpOAuthRelay = new McpOAuthRelay(
            connectedHaus.db,
            startedMcpRuntime,
            undefined,
            undefined,
            githubSignedInHook(options.githubApp ?? null, connectedHaus.db, wakeAgents)
        );
        const contextDependencies = {
            messageRouter: options.messageRouter,
            agentDelivery,
            appOrigin: options.appOrigin,
            attachmentRoot,
            ...artifacts,
            avatarImageService,
            cloudflareAdmissions,
            developmentAuth,
            hausSessions,
            sessionConnections,
            computerConnections,
            computerReleaseManifestUrl:
                options.computerReleaseManifestUrl ?? productionComputerManifestUrl,
            githubApp: options.githubApp ?? null,
            hausDb: connectedHaus.db,
            linear,
            mcpIconResolver,
            mcpOAuthRelay,
            mcpRuntime: startedMcpRuntime,
            postCommitWork: startedPostCommitWork,
            runtime,
            triggerRateLimiter,
        } satisfies HausContextDependencies;
        const createContext = createHausContextFactory(contextDependencies);
        const githubIngest = githubDeliveryIngest({
            db: connectedHaus.db,
            delivery: agentDelivery,
            githubApp: contextDependencies.githubApp,
            limiter: triggerRateLimiter,
            postCommitWork: startedPostCommitWork,
            runtime,
        });
        const isAllowedOrigin = (origin: string | undefined) =>
            isAllowedAppOrigin(origin, options.appOrigin);

        const startedApp = Fastify(hausFastifyOptions);
        handles.app = startedApp;

        await startedApp.register(cors, {
            credentials: true,
            methods: ['GET', 'HEAD', 'POST', 'PUT'],
            origin: (origin, callback) => {
                callback(null, isAllowedOrigin(origin));
            },
        });

        await registerHausServerRoutes(startedApp, {
            ...contextDependencies,
            ...(options.cloudflareOAuthMetadataFetch
                ? { cloudflareOAuthMetadataFetch: options.cloudflareOAuthMetadataFetch }
                : {}),
            createContext,
            githubIngest,
            imageGenerationAdapters: options.imageGenerationAdapters,
            linearWebhook: linearServices.webhook,
            releaseIdentity: options.releaseIdentity,
        });

        const startedWebSocketServer = startHausWebSocketServer(startedApp.server, {
            createContext,
            isAllowedOrigin,
        });
        handles.webSocketServer = startedWebSocketServer;
        handles.voiceSocket = startVoiceSocket(startedApp.server, {
            apiKey: options.openAiApiKey,
            connectLive: options.connectLive,
            createContext,
            isAllowedOrigin,
        });
        const startedComputerSocket = startComputerAttachmentSocket(
            startedApp.server,
            connectedHaus.db,
            computerConnections,
            agentDelivery,
            startedPostCommitWork,
            options.thoughtSummarizer ?? null,
            options.computerSocketLiveness
        );
        handles.computerSocket = startedComputerSocket;
        const reminderClock = options.reminderClock ?? { now: () => new Date() };
        await startServerSweeps(runtime, scope, shutdown, {
            appOrigin: options.appOrigin,
            artifactStorage,
            clock: reminderClock,
            db: connectedHaus.db,
            githubApp: options.githubApp ?? null,
            githubIngest,
            githubRecoveryIntervalMs: options.githubRecoveryIntervalMs,
            linearWorkers: linearServices.workers,
            pushReadGraceMs: options.pushReadGraceMs,
            pushSender: options.pushSender ?? null,
            timers: options.sweepTimers,
            wakeAgents,
        });
        handles.recurringWork = await startServerRecurringWork({
            delivery: agentDelivery,
            reminderClock,
            reminderTick: () => tickReminders(connectedHaus.db, reminderClock, agentDelivery),
            runtime,
        });
        registerHausHealth(
            startedApp,
            runtime,
            connectedHaus.health,
            5000,
            () => {
                return (
                    handles.recurringWork?.reminderHealth() ?? {
                        consecutiveFailures: 1,
                        lastSuccessfulTickAt: null,
                        status: 'degraded' as const,
                    }
                );
            },
            hostedMcps?.health
        );

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
