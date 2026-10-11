import { randomBytes } from 'node:crypto';

/** What an install state proves: who started the install, for which Server and connection. */
export interface GithubInstallAttempt {
    connectionId: string;
    serverId: string;
    userId: string;
}

const installStateTtlMs = 15 * 60_000;

/**
 * Server-held, single-use install state (32 random bytes, 15 minutes), the
 * same custody as MCP OAuth state: it never leaves this Server except as the
 * opaque `state` GitHub hands back to `/github/setup`. A restart forgets
 * pending installs; "Add existing installation" recovers them.
 */
export class GithubInstallStates {
    private readonly attempts = new Map<string, GithubInstallAttempt & { expiresAt: number }>();

    constructor(private readonly now: () => number = Date.now) {}

    create(attempt: GithubInstallAttempt): string {
        this.removeExpired();
        const state = randomBytes(32).toString('base64url');
        this.attempts.set(state, { ...attempt, expiresAt: this.now() + installStateTtlMs });
        return state;
    }

    /** Takes the state exactly once. Missing, used, and expired states all answer null. */
    consume(state: string): GithubInstallAttempt | null {
        const attempt = this.attempts.get(state);
        this.attempts.delete(state);
        if (!attempt || attempt.expiresAt <= this.now()) {
            return null;
        }
        return {
            connectionId: attempt.connectionId,
            serverId: attempt.serverId,
            userId: attempt.userId,
        };
    }

    private removeExpired() {
        const now = this.now();
        for (const [state, attempt] of this.attempts) {
            if (attempt.expiresAt <= now) {
                this.attempts.delete(state);
            }
        }
    }
}

/** The running Server's install states, shared by `github.startInstall` and `/github/setup`. */
export const githubInstallStates = new GithubInstallStates();
