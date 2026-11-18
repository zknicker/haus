import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    type GithubFixture,
    insertGithubTrigger,
    problemNotices,
    startGithubFixture,
    triggerState,
} from './github-fixture.ts';

// Problems only follow armed Triggers, so arming a `github` Trigger re-derives
// its problem (specs/github-triggers.md#failure-modes). Without that, a Trigger
// disabled while its installation went away comes back clean and never fires.

let fixture: GithubFixture;
let installationRowId: string;

beforeAll(async () => {
    fixture = await startGithubFixture('github_rearm');
    const { fake } = fixture;
    fake.users.set('ghu_owner', { id: 501, login: 'zach' });
    fake.installations.set(5101, {
        account: { id: 5101, login: 'acme', type: 'Organization' },
        id: 5101,
    });
    fake.memberships.set('ghu_owner:acme', { role: 'admin', state: 'active' });
    fake.repositories.set('ghu_owner:5101', [{ full_name: 'acme/api', id: 7001, private: true }]);
    installationRowId = (
        await fixture.owner.trpc.github.bindInstallation.mutate({
            connectionId: fixture.connectionId,
            githubInstallationId: 5101,
            serverId: fixture.serverId,
        })
    ).installation.id;
    await insertGithubTrigger(fixture, { id: 'trg_rearmremoved01', installationRowId });
});

afterAll(async () => {
    await fixture?.close();
});

test('re-arming a Trigger whose installation was removed while disabled shows the problem', async () => {
    const setStatus = (status: 'armed' | 'disabled') =>
        fixture.owner.trpc.trigger.setStatus.mutate({
            serverId: fixture.serverId,
            status,
            triggerId: 'trg_rearmremoved01',
        });
    await setStatus('disabled');
    await fixture.owner.trpc.github.unbindInstallation.mutate({
        installationId: installationRowId,
        serverId: fixture.serverId,
    });
    expect((await triggerState(fixture, 'trg_rearmremoved01'))?.problem).toBeNull();

    const { trigger } = await setStatus('armed');
    expect(trigger.status).toBe('armed');
    expect(trigger.kind === 'github' ? trigger.github.problem : null).toBe('installation_removed');
    expect((await triggerState(fixture, 'trg_rearmremoved01'))?.problem).toBe(
        'installation_removed'
    );
    expect(await problemNotices(fixture, 'trg_rearmremoved01')).toHaveLength(1);

    // Arming again is a no-op and queues no second notice.
    await setStatus('armed');
    expect(await problemNotices(fixture, 'trg_rearmremoved01')).toHaveLength(1);
});
