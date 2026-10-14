import { makeProcessTelemetryRelay } from '@haus/effect';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import type { FastifyInstance } from 'fastify';
import { registerAgentArtifactRoutes } from './agent-api/artifact-routes.ts';
import { registerCloudAgentBootstrapRoutes } from './agent-api/cloud-agent-bootstrap-routes.ts';
import { registerCloudAgentInputRoutes } from './agent-api/cloud-agent-input-routes.ts';
import { registerAgentApiRoutes } from './agent-api/routes.ts';
import { registerAttachmentRoutes } from './attachments/attachment-routes.ts';
import { registerAvatarRoutes } from './avatars/avatar-routes.ts';
import { registerComputerRoutes } from './computers/routes.ts';
import { type GithubRouteOptions, registerGithubRoutes } from './github/routes.ts';
import { registerGithubSetupRoute } from './github/setup-route.ts';
import type { createHausContextFactory, HausContextDependencies } from './haus-api/context.ts';
import { hausRouter } from './haus-api/router.ts';
import type { HausReleaseIdentity } from './haus-release-identity.ts';
import { registerHausReleaseRoute } from './haus-release-route.ts';
import { registerMcpOAuthCallback } from './server-mcp/oauth-callback-route.ts';
import { registerTriggerRoutes } from './triggers/trigger-route.ts';

export interface HausServerRouteDependencies extends HausContextDependencies {
    createContext: ReturnType<typeof createHausContextFactory>;
    /** The GitHub delivery ingest the webhook shares with recovery. */
    githubIngest: GithubRouteOptions['ingest'];
    releaseIdentity?: HausReleaseIdentity | null;
}

/** Registers every HTTP route the Server answers: REST surfaces, then tRPC. */
export async function registerHausServerRoutes(
    app: FastifyInstance,
    dependencies: HausServerRouteDependencies
): Promise<void> {
    const db = dependencies.hausDb;
    await registerAttachmentRoutes(app, {
        clerkSessions: dependencies.clerkSessions,
        db,
        root: dependencies.attachmentRoot,
        runtime: dependencies.runtime,
    });
    registerAgentArtifactRoutes(app, {
        appOrigin: dependencies.appOrigin,
        db,
        storage: dependencies.artifactStorage,
        budget: dependencies.artifactStorageBytes,
    });
    registerAvatarRoutes(app, { db });
    registerComputerRoutes(app, {
        appOrigin: dependencies.appOrigin,
        db,
        telemetryRelay: makeProcessTelemetryRelay(),
    });
    registerAgentApiRoutes(app, {
        agentDelivery: dependencies.agentDelivery,
        avatarImageService: dependencies.avatarImageService,
        attachmentRoot: dependencies.attachmentRoot,
        computers: dependencies.computerConnections,
        db,
        githubApp: dependencies.githubApp,
        mcpRuntime: dependencies.mcpRuntime,
        postCommitWork: dependencies.postCommitWork,
    });
    registerCloudAgentInputRoutes(app, {
        db,
        appOrigin: dependencies.appOrigin,
        agentDelivery: dependencies.agentDelivery,
        postCommitWork: dependencies.postCommitWork,
        computers: dependencies.computerConnections,
    });
    registerCloudAgentBootstrapRoutes(app, {
        db,
        appOrigin: dependencies.appOrigin,
        computers: dependencies.computerConnections,
    });
    registerMcpOAuthCallback(app, dependencies.mcpOAuthRelay);
    registerGithubSetupRoute(app, {
        appOrigin: dependencies.appOrigin,
        db,
        githubApp: dependencies.githubApp,
        wake: (wakes) => {
            void dependencies.postCommitWork.wakeAgents(dependencies.agentDelivery, wakes);
        },
    });
    await registerGithubRoutes(app, {
        githubApp: dependencies.githubApp,
        ingest: dependencies.githubIngest,
    });
    await registerTriggerRoutes(app, {
        db,
        delivery: dependencies.agentDelivery,
        limiter: dependencies.triggerRateLimiter,
        postCommitWork: dependencies.postCommitWork,
        runtime: dependencies.runtime,
    });
    registerHausReleaseRoute(app, { releaseIdentity: dependencies.releaseIdentity });

    await app.register(fastifyTRPCPlugin, {
        prefix: '/trpc',
        trpcOptions: {
            allowMethodOverride: true,
            createContext: dependencies.createContext,
            router: hausRouter,
        },
    });
}
