import { expect, test } from 'bun:test';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture, storage } = push;
const bom = String.fromCharCode(0xfe_ff);

test('a clean merge keeps the byte order mark every side started with', async () => {
    const orbit = await push.orbitWriter();
    const seed = await push.publish(
        orbit,
        { path: 'haus/bom/rows.csv', request_id: 'bom-seed' },
        bytesOf(`${bom}name,count\nalpha,1\nmid,0\nbeta,2\n`)
    );
    const first = await push.dispatch('run_bom_first');
    const second = await push.dispatch('run_bom_second', { agentId: fixture.peerAgentId });
    const put = (runner: { token: string }, pushId: string, body: string) =>
        push.putOutcome(
            runner,
            {
                base_revision_id: seed.revision_id,
                path: 'haus/bom/rows.csv',
                push_id: pushId,
                request_id: `bom-${pushId}`,
            },
            bytesOf(body)
        );
    expectOutcome(
        await put(first, 'run_bom_first', `${bom}name,count\nalpha,10\nmid,0\nbeta,2\n`),
        'committed'
    );
    const merged = expectOutcome(
        await put(second, 'run_bom_second', `${bom}name,count\nalpha,1\nmid,0\nbeta,20\n`),
        'merged'
    );

    const [row] = await fixture.harness.sql`
        select object_key from artifact_revisions where id = ${merged.current.revision_id}`;
    expect([...(storage.objects.get(row?.object_key) ?? []).slice(0, 3)]).toEqual([
        0xef, 0xbb, 0xbf,
    ]);
    expect(
        new TextDecoder('utf-8', { ignoreBOM: true }).decode(storage.objects.get(row?.object_key))
    ).toBe(`${bom}name,count\nalpha,10\nmid,0\nbeta,20\n`);
});

function bytesOf(text: string) {
    return new TextEncoder().encode(text);
}
