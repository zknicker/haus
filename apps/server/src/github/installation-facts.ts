import {
    type GithubAccount,
    type GithubInstallationPermissions,
    type GithubRepositorySelection,
    githubAccountTypeSchema,
    githubInstallationPermissionsSchema,
    githubRepositorySelectionSchema,
} from '@haus/api';
import * as z from 'zod';
import type { GithubAppJwtSigner } from './app-auth.ts';
import { type GithubApiTransport, githubNextPage, githubRequest } from './github-api.ts';

// What GitHub says about an installation. Canonical facts come only from
// `GET /app/installations/{id}` with the App JWT; a setup redirect's
// `installation_id` is a hint that can be spoofed.

/** One installation as the App sees it. */
export interface GithubInstallationFacts {
    account: GithubAccount;
    events: string[];
    githubInstallationId: number;
    permissions: GithubInstallationPermissions;
    repositorySelection: GithubRepositorySelection;
    suspended: boolean;
}

const accountSchema = z.object({
    id: z.number().int().positive(),
    login: z.string().min(1),
    type: githubAccountTypeSchema,
});

const installationSchema = z.object({
    account: accountSchema,
    events: z.array(z.string()).default([]),
    id: z.number().int().positive(),
    permissions: z.record(z.string(), z.unknown()).default({}),
    repository_selection: githubRepositorySelectionSchema,
    suspended_at: z.string().nullable().optional(),
});

/** Reads one installation with the App JWT; `GithubApiError` carries 404 and retryable answers. */
export async function readGithubInstallationFacts(
    app: { signer: GithubAppJwtSigner; transport?: GithubApiTransport },
    githubInstallationId: number
): Promise<GithubInstallationFacts> {
    const response = await githubRequest(
        {
            credential: { jwt: await app.signer.jwt(), kind: 'app' },
            path: `/app/installations/${githubInstallationId}`,
        },
        app.transport
    );
    return toFacts(installationSchema.parse(response.body));
}

/**
 * Installations the user token can see (`GET /user/installations`), every
 * page. Seeing one is not authority over it.
 */
export async function listGithubUserInstallations(
    transport: GithubApiTransport | undefined,
    token: string
): Promise<GithubInstallationFacts[]> {
    const facts: GithubInstallationFacts[] = [];
    let path: string | null = '/user/installations';
    let query: Record<string, number> | undefined = { per_page: 100 };
    while (path) {
        const response = await githubRequest(
            { credential: { kind: 'user', token }, path, query },
            transport
        );
        const page = z
            .object({ installations: z.array(z.unknown()) })
            .parse(response.body)
            .installations.flatMap((entry) => {
                const parsed = installationSchema.safeParse(entry);
                return parsed.success ? [toFacts(parsed.data)] : [];
            });
        facts.push(...page);
        path = githubNextPage(response.headers);
        query = undefined;
    }
    return facts;
}

function toFacts(installation: z.infer<typeof installationSchema>): GithubInstallationFacts {
    return {
        account: installation.account,
        events: installation.events,
        githubInstallationId: installation.id,
        permissions: knownPermissions(installation.permissions),
        repositorySelection: installation.repository_selection,
        suspended: Boolean(installation.suspended_at),
    };
}

/** Keeps the permission levels Haus understands; anything else is dropped, not guessed. */
function knownPermissions(raw: Record<string, unknown>): GithubInstallationPermissions {
    const entries = Object.entries(raw).filter(
        ([, level]) => githubInstallationPermissionsSchema.safeParse({ probe: level }).success
    );
    return Object.fromEntries(entries) as GithubInstallationPermissions;
}
