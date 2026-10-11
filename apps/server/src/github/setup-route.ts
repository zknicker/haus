import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import * as z from 'zod';
import type { HausDatabase } from '../postgres/connection.ts';
import { serversTable } from '../postgres/schema.ts';
import { GithubApiError } from './github-api.ts';
import type { GithubApp } from './github-app.ts';
import { GithubRefusedError } from './github-errors.ts';
import {
    type GithubInstallAttempt,
    type GithubInstallStates,
    githubInstallStates,
} from './install-state.ts';
import { bindGithubInstallation } from './installation-binding.ts';
import { reconcileGithubInstallation } from './installation-reconcile.ts';
import { problemWakes } from './trigger-problems.ts';

export const githubSetupPath = '/github/setup';

export interface GithubSetupRouteDependencies {
    appOrigin: string;
    clock?: { now(): Date };
    db: HausDatabase;
    githubApp: GithubApp | null;
    states?: GithubInstallStates;
    wake(wakes: { agentId: string; serverId: string }[]): void;
}

const querySchema = z.object({
    installation_id: z.coerce.number().int().positive().optional(),
    setup_action: z.string().max(32).optional(),
    state: z.string().min(1).max(200).optional(),
});

/**
 * GitHub's setup URL (specs/github-app-connection.md#binding). A valid
 * install state is consumed exactly once, the owner check and App-JWT facts
 * run, and the browser returns to the connection page with
 * `?github_setup=<outcome>`. Missing, expired, or used state binds nothing.
 * An update redirect carries no state and only prompts a reconcile, because
 * a redirect's `installation_id` is never trusted on its own.
 */
export function registerGithubSetupRoute(
    app: FastifyInstance,
    dependencies: GithubSetupRouteDependencies
) {
    const states = dependencies.states ?? githubInstallStates;
    const clock = dependencies.clock ?? { now: () => new Date() };
    app.get(githubSetupPath, async (request, reply) => {
        const { githubApp } = dependencies;
        if (!githubApp) {
            return page(reply, 503, 'GitHub is unavailable', 'This Haus Server has no GitHub App.');
        }
        const parsed = querySchema.safeParse(request.query);
        const query = parsed.success ? parsed.data : {};
        const attempt = query.state ? states.consume(query.state) : null;
        if (!attempt) {
            if (query.setup_action === 'update' && query.installation_id) {
                await reconcileGithubInstallation(
                    {
                        app: githubApp.signer,
                        clock,
                        db: dependencies.db,
                        transport: githubApp.transport,
                    },
                    { githubInstallationId: query.installation_id }
                ).catch((error: unknown) => {
                    // The hourly sweep reconciles again; the browser only needs a page.
                    console.error(
                        '[haus] GitHub setup update reconcile failed',
                        error instanceof Error ? error.name : 'unknown error'
                    );
                });
                return page(reply, 200, 'GitHub updated', 'You can return to Haus.');
            }
            return page(
                reply,
                400,
                'Installation link expired',
                'Return to Haus and choose Install on GitHub again, or use Add existing installation.'
            );
        }
        const back = await connectionPage(dependencies, attempt);
        const outcome = await setupOutcome({ ...dependencies, clock, githubApp }, attempt, query);
        return reply.redirect(`${back}?github_setup=${outcome}`, 302);
    });
}

/** Binds from a consumed state and names the outcome the connection page shows. */
async function setupOutcome(
    dependencies: GithubSetupRouteDependencies & { clock: { now(): Date }; githubApp: GithubApp },
    attempt: GithubInstallAttempt,
    query: z.infer<typeof querySchema>
): Promise<string> {
    if (query.setup_action === 'request') {
        return 'requested';
    }
    if (!query.installation_id) {
        return 'github_installation_not_found';
    }
    try {
        const bound = await bindGithubInstallation(
            { app: dependencies.githubApp, clock: dependencies.clock, db: dependencies.db },
            { ...attempt, githubInstallationId: query.installation_id }
        );
        if (bound.entered.length > 0) {
            dependencies.wake(problemWakes(attempt.serverId, bound.entered));
        }
        return 'bound';
    } catch (cause) {
        if (cause instanceof GithubRefusedError) {
            return cause.reason;
        }
        if (cause instanceof GithubApiError) {
            return 'github_unavailable';
        }
        throw cause;
    }
}

async function connectionPage(
    dependencies: GithubSetupRouteDependencies,
    attempt: { connectionId: string; serverId: string }
) {
    const [server] = await dependencies.db
        .select({ slug: serversTable.slug })
        .from(serversTable)
        .where(eq(serversTable.id, attempt.serverId))
        .limit(1);
    const origin = dependencies.appOrigin.replace(/\/$/u, '');
    return `${origin}/s/${encodeURIComponent(server?.slug ?? '')}/settings/connections/${encodeURIComponent(attempt.connectionId)}`;
}

function page(reply: FastifyReply, status: number, title: string, message: string) {
    return reply
        .code(status)
        .header('content-type', 'text/html; charset=utf-8')
        .send(
            `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`
        );
}
