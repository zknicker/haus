import { afterAll, beforeAll, expect, test } from 'bun:test';
import { reconcileGithubInstallation } from '../src/github/installation-reconcile.ts';
import { refreshGithubUserToken } from '../src/github/user-token.ts';
import {
    type GithubFixture,
    insertGithubTrigger,
    problemNotices,
    startGithubFixture,
    triggerState,
} from './github-fixture.ts';

// GitHub refresh tokens are single use (specs/github-app-connection.md#sign-in):
// concurrent refreshes share one exchange, and a refresh never overwrites a
// pair another path rotated first.

let fixture: GithubFixture;
let installationRowId: string;

beforeAll(async () => {
    fixture = await startGithubFixture('github_user_token');
    const { fake } = fixture;
    fake.users.set('ghu_owner', { id: 501, login: 'zach' });
    fake.installations.set(5201, {
        account: { id: 5201, login: 'acme', type: 'Organization' },
        id: 5201,
    });
    fake.memberships.set('ghu_owner:acme', { role: 'admin', state: 'active' });
    fake.repositories.set('ghu_owner:5201', [{ full_name: 'acme/api', id: 7001, private: true }]);
    installationRowId = (
        await fixture.owner.trpc.github.bindInstallation.mutate({
            connectionId: fixture.connectionId,
            githubInstallationId: 5201,
            serverId: fixture.serverId,
        })
    ).installation.id;
    await insertGithubTrigger(fixture, { id: 'trg_usertokensignin1', installationRowId });
});

afterAll(async () => {
    await fixture?.close();
});

const connection = () => ({ connectionId: fixture.connectionId, serverId: fixture.serverId });

async function storedTokens() {
    const [row] = (await fixture.harness.sql`
        select secret -> 'tokens' as tokens from mcp_secrets
        where connection_id = ${fixture.connectionId}
    `) as { tokens: Record<string, string> }[];
    return row?.tokens;
}

const refreshPosts = () =>
    fixture.fake.requests.filter((request) => request === 'POST /login/oauth/access_token').length;

test('concurrent refreshes share one exchange and none asks for sign-in', async () => {
    fixture.fake.refreshes.set('ghr_owner', {
        access_token: 'ghu_owner_2',
        refresh_token: 'ghr_owner_2',
    });
    const before = refreshPosts();
    const dependencies = { db: fixture.database.db, transport: fixture.fake.app.transport };
    const tokens = await Promise.all(
        [1, 2, 3].map(() => refreshGithubUserToken(dependencies, connection(), 'ghu_owner'))
    );
    expect(tokens).toEqual(['ghu_owner_2', 'ghu_owner_2', 'ghu_owner_2']);
    expect(refreshPosts() - before).toBe(1);
    expect(await storedTokens()).toMatchObject({
        access_token: 'ghu_owner_2',
        refresh_token: 'ghr_owner_2',
    });
});

test('a refresh never overwrites a pair another path rotated meanwhile', async () => {
    fixture.fake.refreshes.set('ghr_owner_2', {
        access_token: 'ghu_owner_3',
        refresh_token: 'ghr_owner_3',
    });
    const base = fixture.fake.app.transport.fetch ?? fetch;
    const transport = {
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).endsWith('/login/oauth/access_token')) {
                // The MCP OAuth provider rotates and stores its own pair first.
                await fixture.harness.sql`
                    update mcp_secrets
                    set secret = jsonb_set(
                        jsonb_set(secret, '{tokens,access_token}', '"ghu_winner"'),
                        '{tokens,refresh_token}', '"ghr_winner"')
                    where connection_id = ${fixture.connectionId}
                `;
            }
            return await base(input, init);
        }) as typeof fetch,
    };
    const token = await refreshGithubUserToken(
        { db: fixture.database.db, transport },
        connection(),
        'ghu_owner_2'
    );
    expect(token).toBe('ghu_winner');
    expect(await storedTokens()).toMatchObject({
        access_token: 'ghu_winner',
        refresh_token: 'ghr_winner',
    });
});

test('a sign-in GitHub refuses invalidates the access cache and degrades Triggers at once', async () => {
    // `ghu_winner` is unknown to GitHub and `ghr_winner` has no refresh: sign-in is required.
    const outcome = await reconcileGithubInstallation(
        {
            app: fixture.fake.app.signer,
            clock: { now: () => new Date() },
            db: fixture.database.db,
            transport: fixture.fake.app.transport,
        },
        { githubInstallationId: 5201 }
    );
    expect(outcome).toMatchObject({
        entered: [{ problem: 'sign_in_required', triggerId: 'trg_usertokensignin1' }],
        kind: 'reconciled',
        status: 'active',
    });
    const [row] = (await fixture.harness.sql`
        select access_synced_at from github_installations where id = ${installationRowId}
    `) as { access_synced_at: Date | null }[];
    expect(row?.access_synced_at).toBeNull();
    expect((await triggerState(fixture, 'trg_usertokensignin1'))?.problem).toBe('sign_in_required');
    expect(await problemNotices(fixture, 'trg_usertokensignin1')).toHaveLength(1);
});
