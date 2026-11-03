import type { FastifyInstance } from 'fastify';
import type { GithubDelivery, GithubIngestOutcome } from './delivery-ingest.ts';
import type { GithubApp } from './github-app.ts';
import { registerGithubSinkRoute } from './sink-route.ts';
import { registerGithubWebhookRoute } from './webhook-route.ts';

/**
 * The public GitHub App delivery edges. The installation setup redirect is
 * `github/setup-route.ts`.
 */
export const githubRoutePaths = {
    /** The development App's delivery sink. */
    sink: '/api/github/sink',
    /** Every installation's app webhook. */
    webhook: '/api/github/webhook',
} as const;

export interface GithubRouteOptions {
    githubApp: GithubApp | null;
    ingest(delivery: GithubDelivery): Promise<GithubIngestOutcome>;
}

/** Registers the GitHub App's delivery edges ahead of tRPC, without a Haus session. */
export async function registerGithubRoutes(app: FastifyInstance, options: GithubRouteOptions) {
    await registerGithubSinkRoute(app, githubRoutePaths.sink);
    await registerGithubWebhookRoute(app, {
        ingest: options.ingest,
        path: githubRoutePaths.webhook,
        webhookSecret: options.githubApp?.config.webhookSecret ?? null,
    });
}
