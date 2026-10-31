import { makeProcessTelemetryRelay } from '@haus/effect';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import type { FastifyInstance } from 'fastify';
import { registerAgentArtifactRoutes } from './agent-api/artifact-routes.ts';
import { registerAgentApiRoutes } from './agent-api/routes.ts';
import { registerArtifactPublicRoutes } from './artifacts/public-route.ts';
import { registerArtifactPublishRoute } from './artifacts/publish-route.ts';
import { registerArtifactZipRoute } from './artifacts/zip-route.ts';
import { artifactZipTickets } from './artifacts/zip-tickets.ts';
import { registerAttachmentRoutes } from './attachments/attachment-routes.ts';
import { registerAvatarRoutes } from './avatars/avatar-routes.ts';
import { registerComputerRoutes } from './computers/routes.ts';
import { env } from './config/env.ts';
import { type GithubRouteOptions, registerGithubRoutes } from './github/routes.ts';
import { registerGithubSetupRoute } from './github/setup-route.ts';
import type { createHausContextFactory, HausContextDependencies } from './haus-api/context.ts';
import { hausRouter } from './haus-api/router.ts';
import type { HausReleaseIdentity } from './haus-release-identity.ts';
import { registerHausReleaseRoute } from './haus-release-route.ts';
import { registerAuthRoutes } from './identity/auth-routes.ts';
import { ImageGenerationService } from './image-generation/image-generation-service.ts';
import {
    failInterruptedImageGenerations,
    type ImageProviderAdapters,
} from './image-generation/run-image-generation.ts';
import { linearChipToken } from './linear/issue-chip-tokens.ts';
import { type LinearRouteOptions, registerLinearRoutes } from './linear/routes.ts';
import { registerLinearSignedUrlRoutes } from './linear/signed-url-routes.ts';
import { registerLinearThumbnailRoute } from './linear/thumbnail-route.ts';
import { registerMcpOAuthCallback } from './server-mcp/oauth-callback-route.ts';
import { registerTriggerRoutes } from './triggers/trigger-route.ts';

export interface HausServerRouteDependencies extends HausContextDependencies {
    cloudflareOAuthMetadataFetch?: typeof fetch;
    createContext: ReturnType<typeof createHausContextFactory>;
    /** The GitHub delivery ingest the webhook shares with recovery. */
    githubIngest: GithubRouteOptions['ingest'];
    /** Test seam: replaces the OpenAI and Gemini image adapters outright. */
    imageGenerationAdapters?: ImageProviderAdapters;
    /** Linear's webhook verification and durable ingest (`linear/linear-pipeline.ts`). */
    linearWebhook: LinearRouteOptions['webhook'];
    releaseIdentity?: HausReleaseIdentity | null;
}

/** Registers every HTTP route the Server answers: REST surfaces, then tRPC. */
export async function registerHausServerRoutes(
    app: FastifyInstance,
    dependencies: HausServerRouteDependencies
): Promise<void> {
    const db = dependencies.hausDb;
    registerAuthRoutes(app, dependencies);
    const imageGeneration = new ImageGenerationService({
        adapters: dependencies.imageGenerationAdapters,
        agentDelivery: dependencies.agentDelivery,
        db,
        postCommitWork: dependencies.postCommitWork,
        root: dependencies.attachmentRoot,
    });
    // A restart orphans claimed generations; they can never settle. Pending ones just run.
    await failInterruptedImageGenerations(db, imageGeneration.wake);
    void dependencies.postCommitWork.run('image-generation.sweep', () =>
        imageGeneration.sweepPending()
    );
    await registerAttachmentRoutes(app, {
        hausSessions: dependencies.hausSessions,
        db,
        root: dependencies.attachmentRoot,
        runtime: dependencies.runtime,
    });
    registerAgentArtifactRoutes(app, {
        appOrigin: dependencies.appOrigin,
        db,
        storage: dependencies.artifactStorage,
        budget: dependencies.artifactStorageBytes,
        thumbnails: dependencies.artifactThumbnails,
    });
    registerArtifactPublishRoute(app, {
        appOrigin: dependencies.appOrigin,
        budget: dependencies.artifactStorageBytes,
        hausSessions: dependencies.hausSessions,
        db,
        storage: dependencies.artifactStorage,
        thumbnails: dependencies.artifactThumbnails,
    });
    registerArtifactPublicRoutes(app, {
        db,
        storage: dependencies.artifactStorage,
        thumbnails: dependencies.artifactThumbnails,
    });
    registerArtifactZipRoute(app, {
        db,
        storage: dependencies.artifactStorage,
        tickets: artifactZipTickets,
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
        imageGeneration,
        linear: dependencies.linear,
        mcpRuntime: dependencies.mcpRuntime,
        postCommitWork: dependencies.postCommitWork,
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
    await registerLinearRoutes(app, {
        oauthCallback: {
            appOrigin: dependencies.appOrigin,
            db,
            linearApp: dependencies.linear.app,
            mcpIconResolver: dependencies.mcpIconResolver,
            mcpRuntime: dependencies.mcpRuntime,
        },
        webhook: dependencies.linearWebhook,
    });
    registerLinearSignedUrlRoutes(app, {
        db,
        signingKey: env.HAUS_LINEAR_URL_SIGNING_KEY ?? null,
        storage: dependencies.artifactStorage,
    });
    registerLinearThumbnailRoute(app, {
        connectionAccessToken: linearChipToken(dependencies.linear.refresher),
        signingKey: env.HAUS_LINEAR_URL_SIGNING_KEY ?? null,
        transport: fetch,
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
