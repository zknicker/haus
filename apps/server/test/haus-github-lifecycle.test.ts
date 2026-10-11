import { afterAll, beforeAll, expect, test } from 'bun:test';
import { retireRemovedTriggerItemsForRun } from '../src/agent-delivery/retire-removed-trigger-items.ts';
import { reconcileGithubInstallation } from '../src/github/installation-reconcile.ts';
import { sweepGithubInstallations } from '../src/github/installation-sweep.ts';
import { refreshGithubRepositoryAccess } from '../src/github/repository-access.ts';
import {
    type GithubFixture,
    insertGithubTrigger,
    problemNotices,
    startGithubFixture,
    triggerState,
} from './github-fixture.ts';

// Lifecycle reconciliation, repository access, and removal
// (specs/github-app-connection.md#lifecycle-reconciliation): GitHub's App-JWT
// answer decides status, every entered problem notifies its owner once, and
// deletion tombstones before the connection goes.

let fixture: GithubFixture;
let acmeRowId: string;
let betaRowId: string;
const clock = { now: () => new Date() };

beforeAll(async () => {
    fixture = await startGithubFixture('github_lifecycle');
    const { fake } = fixture;
    fake.users.set('ghu_owner', { id: 501, login: 'zach' });
    for (const [id, login] of [
        [5001, 'acme'],
        [5002, 'beta'],
    ] as const) {
        fake.installations.set(id, { account: { id, login, type: 'Organization' }, id });
        fake.memberships.set(`ghu_owner:${login}`, { role: 'admin', state: 'active' });
    }
    fake.repositories.set('ghu_owner:5001', [{ full_name: 'acme/api', id: 7001, private: true }]);
    fake.repositories.set('ghu_owner:5002', [
        { full_name: 'beta/api', id: 8001, private: true },
        { full_name: 'beta/web', id: 8002, private: true },
    ]);
    const bind = async (githubInstallationId: number) =>
        (
            await fixture.owner.trpc.github.bindInstallation.mutate({
                connectionId: fixture.connectionId,
                githubInstallationId,
                serverId: fixture.serverId,
            })
        ).installation.id;
    acmeRowId = await bind(5001);
    betaRowId = await bind(5002);
    await insertGithubTrigger(fixture, { id: 'trg_lifecycleacme01', installationRowId: acmeRowId });
    await insertGithubTrigger(fixture, {
        id: 'trg_lifecyclebeta01',
        installationRowId: betaRowId,
        repositoryIds: [8002],
    });
    await insertGithubTrigger(fixture, { id: 'trg_lifecyclebeta02', installationRowId: betaRowId });
});

afterAll(async () => {
    await fixture?.close();
});

const reconcile = (githubInstallationId: number) =>
    reconcileGithubInstallation(
        {
            app: fixture.fake.app.signer,
            clock,
            db: fixture.database.db,
            transport: fixture.fake.app.transport,
        },
        { githubInstallationId }
    );

test('rate limits and outages change nothing', async () => {
    for (const status of [429, 500, 503]) {
        fixture.fake.appStatus.set(5001, status);
        expect(await reconcile(5001)).toEqual({ kind: 'retry' });
    }
    fixture.fake.appStatus.delete(5001);
    expect(await triggerState(fixture, 'trg_lifecycleacme01')).toEqual({
        problem: null,
        version: 1,
    });
    expect(await reconcile(424_242)).toEqual({ kind: 'unbound' });
});

test('suspension degrades its Triggers once and lifting it clears them', async () => {
    const acme = fixture.fake.installations.get(5001);
    fixture.fake.installations.set(5001, { ...acme!, suspended_at: '2026-10-11T12:00:00Z' });
    expect(await reconcile(5001)).toMatchObject({ kind: 'reconciled', status: 'suspended' });
    expect(await reconcile(5001)).toMatchObject({ entered: [], status: 'suspended' });
    expect(await triggerState(fixture, 'trg_lifecycleacme01')).toEqual({
        problem: 'installation_suspended',
        version: 2,
    });
    const notices = await problemNotices(fixture, 'trg_lifecycleacme01');
    expect(notices).toHaveLength(1);
    expect(notices[0]?.content).toContain('problem=installation_suspended');

    fixture.fake.installations.set(5001, { ...acme!, suspended_at: null });
    expect(await reconcile(5001)).toMatchObject({ status: 'active' });
    expect(await triggerState(fixture, 'trg_lifecycleacme01')).toEqual({
        problem: null,
        version: 3,
    });
    expect(await problemNotices(fixture, 'trg_lifecycleacme01')).toHaveLength(1);
});

test('a selected repository leaving access degrades only the Trigger that selected it', async () => {
    const refresh = () =>
        refreshGithubRepositoryAccess(
            { clock, db: fixture.database.db, transport: fixture.fake.app.transport },
            { id: betaRowId, serverId: fixture.serverId }
        );
    fixture.fake.repositories.set('ghu_owner:5002', [
        { full_name: 'beta/api', id: 8001, private: true },
    ]);
    expect(await refresh()).toMatchObject({ kind: 'refreshed' });
    expect((await triggerState(fixture, 'trg_lifecyclebeta01'))?.problem).toBe(
        'repositories_unavailable'
    );
    expect((await triggerState(fixture, 'trg_lifecyclebeta02'))?.problem).toBeNull();

    fixture.fake.repositoryStatus.set(5002, 502);
    expect(await refresh()).toEqual({ kind: 'retry' });
    const [cache] = (await fixture.harness.sql`
        select accessible_repository_ids from github_installations where id = ${betaRowId}
    `) as { accessible_repository_ids: string[] }[];
    expect(cache?.accessible_repository_ids.map(Number)).toEqual([8001]);
});

test('an access cache older than a day becomes sign-in required while GitHub is down', async () => {
    await fixture.harness.sql`
        update github_installations set access_synced_at = now() - interval '25 hours'
        where id = ${betaRowId}
    `;
    fixture.fake.appStatus.set(5002, 503);
    await sweepGithubInstallations({ app: fixture.fake.app, clock, db: fixture.database.db });
    expect((await triggerState(fixture, 'trg_lifecyclebeta02'))?.problem).toBe('sign_in_required');

    fixture.fake.appStatus.delete(5002);
    fixture.fake.repositoryStatus.delete(5002);
    fixture.fake.repositories.set('ghu_owner:5002', [
        { full_name: 'beta/api', id: 8001, private: true },
        { full_name: 'beta/web', id: 8002, private: true },
    ]);
    await sweepGithubInstallations({ app: fixture.fake.app, clock, db: fixture.database.db });
    expect((await triggerState(fixture, 'trg_lifecyclebeta01'))?.problem).toBeNull();
    expect((await triggerState(fixture, 'trg_lifecyclebeta02'))?.problem).toBeNull();
});

test('GitHub answering 404 tombstones the installation and notifies once', async () => {
    fixture.fake.appStatus.set(5001, 404);
    expect(await reconcile(5001)).toMatchObject({ kind: 'reconciled', status: 'removed' });
    expect(await reconcile(5001)).toEqual({ kind: 'unbound' });
    const [row] = (await fixture.harness.sql`
        select status, connection_id, removed_at is not null as removed
        from github_installations where id = ${acmeRowId}
    `) as { connection_id: string | null; removed: boolean; status: string }[];
    expect(row).toEqual({ connection_id: null, removed: true, status: 'removed' });
    expect((await triggerState(fixture, 'trg_lifecycleacme01'))?.problem).toBe(
        'installation_removed'
    );
    expect(await problemNotices(fixture, 'trg_lifecycleacme01')).toHaveLength(2);
});

test('deleting the GitHub connection degrades every Trigger with one notice before it goes', async () => {
    await fixture.owner.trpc.mcp.delete.mutate({
        connectionId: fixture.connectionId,
        serverId: fixture.serverId,
    });
    expect(
        await fixture.harness.sql`select id from mcp_connections where id = ${fixture.connectionId}`
    ).toEqual([]);
    const [row] = (await fixture.harness.sql`
        select status, connection_id from github_installations where id = ${betaRowId}
    `) as { connection_id: string | null; status: string }[];
    expect(row).toEqual({ connection_id: null, status: 'removed' });
    for (const triggerId of ['trg_lifecyclebeta01', 'trg_lifecyclebeta02']) {
        expect((await triggerState(fixture, triggerId))?.problem).toBe('installation_removed');
        const notices = await problemNotices(fixture, triggerId);
        expect(
            notices.filter((notice) => notice.content.includes('installation_removed'))
        ).toHaveLength(1);
    }
    expect(await fixture.harness.sql`select id from triggers where deleted_at is not null`).toEqual(
        []
    );

    // Problem notices are concrete and bodiless: retiring removed fires never touches them.
    await retireRemovedTriggerItemsForRun(fixture.database.db, fixture.agentId);
    expect(await problemNotices(fixture, 'trg_lifecyclebeta02')).not.toHaveLength(0);
});
