import { TRPCError } from '@trpc/server';
import { GithubApiError } from '../../github/github-api.ts';
import type { GithubApp } from '../../github/github-app.ts';
import { GithubAppUnavailableError, GithubRefusedError } from '../../github/github-errors.ts';
import { McpDeniedError } from '../../server-mcp/errors.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * GitHub connection work. Refusals keep their stable reason at the front of
 * the message (`github_owner_required: …`); a GitHub outage is BAD_GATEWAY
 * so the App can offer a retry instead of a fix.
 */
export const githubProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const { cause } = result.error;
    if (cause instanceof GithubRefusedError) {
        throw new TRPCError({ cause, code: cause.code, message: cause.message });
    }
    if (cause instanceof McpDeniedError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }
    if (cause instanceof GithubApiError) {
        throw new TRPCError({
            cause,
            code: 'BAD_GATEWAY',
            message: 'github_unavailable: GitHub did not answer. Try again shortly.',
        });
    }
    throw result.error;
});

export function requireGithubApp(app: GithubApp | null): GithubApp {
    if (!app) {
        throw new GithubAppUnavailableError();
    }
    return app;
}

export const githubClock = { now: () => new Date() };
