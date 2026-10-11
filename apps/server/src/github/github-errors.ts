/**
 * Why a GitHub connection request was refused. Each code maps to one tRPC
 * code, and the message leads with a stable reason so the App and Agents can
 * key on it (`github_owner_required: …`).
 */
export type GithubRefusalCode = 'BAD_REQUEST' | 'CONFLICT' | 'FORBIDDEN' | 'NOT_FOUND';

export class GithubRefusedError extends Error {
    constructor(
        readonly code: GithubRefusalCode,
        readonly reason: string,
        detail: string
    ) {
        super(`${reason}: ${detail}`);
        this.name = 'GithubRefusedError';
    }
}

/**
 * The connection's GitHub user must sign in again: no stored token, a refresh
 * token GitHub rejected, or a connection that is not connected.
 */
export class GithubSignInRequiredError extends GithubRefusedError {
    constructor(detail = 'Sign in to GitHub again from Settings → Connections.') {
        super('BAD_REQUEST', 'github_sign_in_required', detail);
        this.name = 'GithubSignInRequiredError';
    }
}

/** The Haus GitHub App's credentials are not configured on this Server. */
export class GithubAppUnavailableError extends GithubRefusedError {
    constructor() {
        super(
            'BAD_REQUEST',
            'github_app_unconfigured',
            'The Haus GitHub App is not configured on this Server.'
        );
        this.name = 'GithubAppUnavailableError';
    }
}
