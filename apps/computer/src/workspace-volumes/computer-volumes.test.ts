import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detachServerWorkspaces, reclaimStaleWorkspaces } from './computer-volumes.ts';
import { fakeHdiutil, holderListing } from './disk-fixtures.ts';

let dataRoot: string;
let agentsRoot: string;
const quiet = () => [
    spyOn(console, 'warn').mockImplementation(() => undefined),
    spyOn(console, 'error').mockImplementation(() => undefined),
];

beforeEach(async () => {
    dataRoot = await realpath(await mkdtemp(join(tmpdir(), 'haus-computer-volumes-')));
    agentsRoot = join(dataRoot, 'servers', 'srv_1234567890abcdef', 'agents');
});

afterEach(async () => {
    await rm(dataRoot, { force: true, recursive: true });
});

test('Computer start reclaims a stale mount and reservations whose Agent is gone', async () => {
    const spies = quiet();
    const live = await agentPartition('agt_live567890abcdef', { manifest: true });
    const stale = await agentPartition('agt_gone567890abcdef', { manifest: false });
    const purged = join(agentsRoot, 'agt_purged7890abcdef');
    await writeLedger([live, stale, purged]);
    const foreign = join(tmpdir(), 'other-computer', 'servers', 'srv_x', 'agents', 'agt_y');
    const host = fakeHdiutil({
        detach: () => 'ok',
        mounted: [join(live, 'workspace'), join(stale, 'workspace'), join(foreign, 'workspace')],
    });
    try {
        const reclaim = await reclaimStaleWorkspaces({
            dataRoot,
            disk: host.disk,
            pacing: host.pacing,
        });

        expect(reclaim).toEqual({
            detached: [join(stale, 'workspace')],
            failed: [],
            released: [stale, purged],
        });
        expect(host.mounted.has(join(live, 'workspace'))).toBe(true);
        expect(host.mounted.has(join(foreign, 'workspace'))).toBe(true);
        expect(Object.keys(await readLedger())).toEqual([live]);
    } finally {
        for (const spy of spies) {
            spy.mockRestore();
        }
    }
});

test('shutdown detaches idle workspaces and leaves a busy one mounted', async () => {
    const spies = quiet();
    const idle = await agentPartition('agt_idle567890abcdef', { manifest: true });
    const busy = await agentPartition('agt_busy567890abcdef', { manifest: true });
    const host = fakeHdiutil({
        detach: () => (host.calls.at(-1)?.at(-1) === join(busy, 'workspace') ? 'busy' : 'ok'),
        holders: () => holderListing([700, 'zsh']),
        mounted: [join(idle, 'workspace'), join(busy, 'workspace')],
    });
    try {
        const stuck = await detachServerWorkspaces({
            dataRoot,
            disk: host.disk,
            onBusy: 'fail',
            pacing: { ...host.pacing, holderPolls: 1 },
            serverId: 'srv_1234567890abcdef',
        });

        expect(stuck).toEqual([busy]);
        expect([...host.mounted]).toEqual([join(busy, 'workspace')]);
        expect(host.calls.some((call) => call.includes('-force'))).toBe(false);
    } finally {
        for (const spy of spies) {
            spy.mockRestore();
        }
    }
});

async function agentPartition(agentId: string, options: { manifest: boolean }) {
    const agentRoot = join(agentsRoot, agentId);
    await mkdir(join(agentRoot, 'workspace'), { recursive: true });
    if (options.manifest) {
        await writeFile(
            join(agentRoot, 'workspace-volume.json'),
            JSON.stringify({ capacityBytes: 1024, volumeUuid: 'volume-uuid' })
        );
    }
    return agentRoot;
}

async function writeLedger(agentRoots: string[]) {
    await writeFile(
        join(dataRoot, 'workspace-storage.json'),
        JSON.stringify({
            allocations: Object.fromEntries(agentRoots.map((root) => [root, 1024])),
            budgetBytes: 1024 ** 3,
        })
    );
}

async function readLedger(): Promise<Record<string, number>> {
    return JSON.parse(await readFile(join(dataRoot, 'workspace-storage.json'), 'utf8')).allocations;
}
