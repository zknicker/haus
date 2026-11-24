import { afterAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { driveFolderLayout } from '../../computer/src/drive/folder-state.ts';
import {
    type DriveRun,
    flushDriveForRun,
    pushDriveForRun,
} from '../../computer/src/drive/turn-sync.ts';
import { drivePushFixture } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;
const laptopId = `cmp_${'f'.repeat(16)}`;
const agentRoot = await mkdtemp(join(tmpdir(), 'haus-flush-resend-'));

afterAll(async () => {
    Bun.spawnSync(['chmod', '-R', 'u+w', agentRoot]);
    await rm(agentRoot, { force: true, recursive: true });
});

test('a flush whose only file the Server refuses before opening its push is resent and lands', async () => {
    const agentId = fixture.orbitAgentId;
    const { serverId } = fixture;
    await fixture.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        select ${laptopId}, server_id, attached_by_user_id, repeat('f', 64), reported_inventory, 'healthy'
        from computers where id = ${fixture.computerId}
    `;
    await fixture.owner.trpc.agent.setMachine.mutate({
        agentId,
        computerId: laptopId,
        fromLastSynced: false,
        serverId,
    });
    const zero = await push.dispatch('run_zero');
    const notes = join(driveFolderLayout(agentRoot, agentId).folder, 'agents', 'orbit', 'notes');
    await mkdir(notes, { recursive: true });
    await writeFile(join(notes, 'first.md'), 'first\n');
    await pushDriveForRun(agentRoot, run('run_zero', [], zero.token));
    await writeFile(join(notes, 'second.md'), 'second\n');
    await reuseRequestIdFor('agents/orbit/notes/second.md', 'second\n');

    await sendFlush('flush_one');
    const refused: string[] = [];
    await flushDriveForRun(agentRoot, run('flush_one', refused));

    expect(refused.map((warning) => warning.split(':')[0])).toEqual(['drive-flush-file-failed']);
    expect(await fixture.harness.sql`select id from drive_pushes where id = 'flush_one'`).toEqual(
        []
    );

    await sendFlush('flush_two');
    const resent: string[] = [];
    await flushDriveForRun(agentRoot, run('flush_two', resent));

    expect(resent).toEqual([]);
    expect(await push.countRows('artifacts', 'agents/orbit/notes/')).toBe(2);
    expect((await fixture.owner.trpc.agent.machine.query({ agentId, serverId })).computerId).toBe(
        laptopId
    );
});

async function sendFlush(flushId: string) {
    await fixture.harness.sql`
        update agent_machine_changes set flush_id = ${flushId}, flush_sent_at = now()
        where agent_id = ${fixture.orbitAgentId}
    `;
}

async function reuseRequestIdFor(path: string, text: string) {
    const [stored] = (await fixture.harness.sql`
        select request_id from drive_push_outcomes where push_id = 'run_zero' limit 1
    `) as { request_id: string }[];
    const layout = driveFolderLayout(agentRoot, fixture.orbitAgentId);
    const state = JSON.parse(await readFile(layout.stateFile, 'utf8'));
    const reused = {
        request_id: stored?.request_id ?? '',
        sha256: createHash('sha256').update(text).digest('hex'),
    };
    await writeFile(
        layout.stateFile,
        JSON.stringify({ ...state, pendingCreates: { [path]: reused } })
    );
}

function run(runId: string, warnings: string[], token?: string) {
    return {
        agentId: fixture.orbitAgentId,
        current: () => true,
        mint: async () => ({
            runnerId: runId,
            runnerToken:
                token ??
                (await fixture.mintRunner(runId, fixture.orbitAgentId, fixture.channelId, false))
                    .token,
        }),
        now: Date.now,
        placementGeneration: 0,
        revoke: async () => undefined,
        runId,
        serverOrigin: fixture.harness.url.origin,
        warn: (event: string, detail: string) => {
            warnings.push(`${event}: ${detail}`);
        },
    } satisfies DriveRun;
}
