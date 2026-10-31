import type { FastifyInstance } from 'fastify';
import {
    type LinearCallbackDependencies,
    registerLinearOauthCallback,
} from './oauth-callback-route.ts';
import {
    type LinearWebhookRouteOptions,
    linearWebhookPaths,
    registerLinearWebhookRoutes,
} from './webhook-route.ts';

/** The public Linear edges (specs/linear-app.md#webhooks, #binding-and-authority). */
export const linearRoutePaths = {
    /** One Agent identity's webhook. */
    identityWebhook: linearWebhookPaths.identity,
    /** Every install's OAuth redirect: workspace and identity installs alike. */
    oauthCallback: '/linear/oauth/callback',
    /** The Haus app's workspace webhook. */
    webhook: linearWebhookPaths.workspace,
} as const;

export interface LinearRouteOptions {
    oauthCallback: LinearCallbackDependencies;
    webhook: LinearWebhookRouteOptions;
}

/**
 * Registers the Linear edges ahead of tRPC, without a Haus session: both webhooks
 * (`webhook-route.ts`) and the OAuth callback (`oauth-callback-route.ts`).
 */
export async function registerLinearRoutes(app: FastifyInstance, options: LinearRouteOptions) {
    await registerLinearWebhookRoutes(app, options.webhook);
    registerLinearOauthCallback(app, options.oauthCallback);
}
