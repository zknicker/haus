import { generateKeyPairSync } from 'node:crypto';
import type { GithubAppConfig } from '../src/github/app-auth.ts';
import { createGithubApp, type GithubApp } from '../src/github/github-app.ts';

// A faked GitHub for Server tests: the REST API (App JWT and user tokens) and
// the OAuth token endpoint. Nothing here talks to the network.

export interface FakeInstallation {
    account: { id: number; login: string; type: 'Organization' | 'User' };
    events?: string[];
    id: number;
    permissions?: Record<string, string>;
    repository_selection?: 'all' | 'selected';
    suspended_at?: string | null;
}

export interface FakeGithub {
    app: GithubApp;
    /** Status overrides for `GET /app/installations/{id}` (404, 429, 503…). */
    appStatus: Map<number, number>;
    /** User tokens GitHub now answers 401 for (expired). */
    expired: Set<string>;
    installations: Map<number, FakeInstallation>;
    /** `${token}:${org}` → membership. */
    memberships: Map<string, { role: 'admin' | 'member'; state: 'active' | 'pending' }>;
    /** Refresh token → the pair GitHub issues for it (single use). */
    refreshes: Map<string, { access_token: string; refresh_token: string }>;
    /** `${token}:${installationId}` → repositories that user reaches. */
    repositories: Map<string, { full_name: string; id: number; private: boolean }[]>;
    /** Status overrides for `GET /user/installations/{id}/repositories`. */
    repositoryStatus: Map<number, number>;
    requests: string[];
    userInstallations: Map<string, number[]>;
    users: Map<string, { id: number; login: string }>;
}

export const fakeGithubClient = { id: 'Iv23fakeclient', secret: 'fake-client-secret' };

export async function createFakeGithub(): Promise<FakeGithub> {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const config: GithubAppConfig = {
        appId: '123456',
        clientId: fakeGithubClient.id,
        clientSecret: fakeGithubClient.secret,
        privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
        slug: 'haus-test',
        webhookSecret: 'w'.repeat(32),
    };
    const fake = {
        appStatus: new Map(),
        expired: new Set<string>(),
        installations: new Map(),
        memberships: new Map(),
        refreshes: new Map(),
        repositories: new Map(),
        repositoryStatus: new Map(),
        requests: [] as string[],
        userInstallations: new Map(),
        users: new Map(),
    } as Omit<FakeGithub, 'app'>;
    const app = await createGithubApp(config, {
        fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
            Promise.resolve(answer(fake, input, init))) as typeof fetch,
    });
    return Object.assign(fake, { app });
}

type FakeState = Omit<FakeGithub, 'app'>;

function answer(fake: FakeState, input: RequestInfo | URL, init?: RequestInit) {
    const url = new URL(input instanceof Request ? input.url : String(input));
    fake.requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.origin === 'https://github.com' && url.pathname === '/login/oauth/access_token') {
        return answerRefresh(fake, new URLSearchParams(String(init?.body ?? '')));
    }
    const token = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /u, '') ?? '';
    const appInstallation = /^\/app\/installations\/(\d+)$/u.exec(url.pathname);
    if (appInstallation) {
        return answerAppInstallation(fake, token, Number(appInstallation[1]));
    }
    if (fake.expired.has(token) || !fake.users.has(token)) {
        return new Response(null, { status: 401 });
    }
    return answerUser(fake, token, url.pathname);
}

function answerRefresh(fake: FakeState, body: URLSearchParams) {
    const pair = fake.refreshes.get(body.get('refresh_token') ?? '');
    if (!(pair && body.get('client_id') === fakeGithubClient.id)) {
        return Response.json({ error: 'bad_refresh_token' });
    }
    fake.refreshes.delete(body.get('refresh_token') ?? '');
    return Response.json({ ...pair, expires_in: 28_800, token_type: 'bearer' });
}

function answerAppInstallation(fake: FakeState, token: string, id: number) {
    if (!token.startsWith('eyJ')) {
        return new Response(null, { status: 401 });
    }
    const status = fake.appStatus.get(id);
    if (status) {
        return new Response(null, { status });
    }
    const installation = fake.installations.get(id);
    return installation ? Response.json(installationJson(installation)) : notFound();
}

function answerUser(fake: FakeState, token: string, path: string) {
    if (path === '/user') {
        return Response.json(fake.users.get(token));
    }
    const membership = /^\/user\/memberships\/orgs\/([^/]+)$/u.exec(path);
    if (membership) {
        const found = fake.memberships.get(`${token}:${decodeURIComponent(membership[1] ?? '')}`);
        return found ? Response.json(found) : notFound();
    }
    if (path === '/user/installations') {
        const ids = fake.userInstallations.get(token) ?? [];
        return Response.json({
            installations: ids.flatMap((id) => {
                const installation = fake.installations.get(id);
                return installation ? [installationJson(installation)] : [];
            }),
            total_count: ids.length,
        });
    }
    const repositories = /^\/user\/installations\/(\d+)\/repositories$/u.exec(path);
    if (repositories) {
        const id = Number(repositories[1]);
        const status = fake.repositoryStatus.get(id);
        if (status) {
            return new Response(null, { status });
        }
        const found = fake.repositories.get(`${token}:${id}`);
        return found
            ? Response.json({ repositories: found, total_count: found.length })
            : notFound();
    }
    return notFound();
}

function installationJson(installation: FakeInstallation) {
    return {
        account: installation.account,
        events: installation.events ?? ['workflow_run'],
        id: installation.id,
        permissions: installation.permissions ?? { actions: 'write', metadata: 'read' },
        repository_selection: installation.repository_selection ?? 'selected',
        suspended_at: installation.suspended_at ?? null,
    };
}

function notFound() {
    return Response.json({ message: 'Not Found' }, { status: 404 });
}
