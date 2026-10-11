import type { GithubAccount } from '@haus/api';
import * as z from 'zod';
import { GithubApiError, type GithubApiTransport, githubRequest } from './github-api.ts';

// GitHub-side binding authority (specs/github-app-connection.md#binding): the
// connection user owns the installation's account. An organization needs an
// active admin membership; a user account must be the user. Ordinary members
// and collaborators can see an installation, so seeing it proves nothing.

export interface GithubUser {
    id: number;
    login: string;
}

const userSchema = z.object({ id: z.number().int().positive(), login: z.string().min(1) });
const membershipSchema = z.object({ role: z.string(), state: z.string() });

/** The signed-in GitHub user behind a user token (`GET /user`). */
export async function readGithubUser(
    transport: GithubApiTransport | undefined,
    token: string
): Promise<GithubUser> {
    const response = await githubRequest(
        { credential: { kind: 'user', token }, path: '/user' },
        transport
    );
    return userSchema.parse(response.body);
}

/**
 * True when `user` owns `account`. A refused or missing membership is `false`;
 * a retryable GitHub failure throws so nothing binds on a guess.
 */
export async function ownsGithubAccount(
    transport: GithubApiTransport | undefined,
    token: string,
    user: GithubUser,
    account: GithubAccount
): Promise<boolean> {
    if (account.type === 'User') {
        return account.id === user.id;
    }
    try {
        const response = await githubRequest(
            {
                credential: { kind: 'user', token },
                path: `/user/memberships/orgs/${encodeURIComponent(account.login)}`,
            },
            transport
        );
        const membership = membershipSchema.parse(response.body);
        return membership.state === 'active' && membership.role === 'admin';
    } catch (cause) {
        if (cause instanceof GithubApiError && cause.failure !== 'retryable') {
            if (cause.status === 401) {
                throw cause;
            }
            return false;
        }
        throw cause;
    }
}
