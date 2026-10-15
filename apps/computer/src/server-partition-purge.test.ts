import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    deleteServerPartition,
    pendingPurgeMarker,
    purgeServerPartition,
    replayPendingServerPurges,
} from './server-partition-purge.ts';
import { fakeHdiutil, holderListing } from './workspace-volumes/disk-fixtures.ts';
import { withStorageLock } from './workspace-volumes/storage-ledger.ts';

const serverId = 'srv_1234567890abcdef';
let dataRoot: string;
let partition: string;
let spies: { mockRestore(): void }[];

beforeEach(async () => {
    dataRoot = await realpath(await mkdtemp(join(tmpdir(), 'haus-server-purge-')));
    partition = join(dataRoot, 'servers', serverId);
    spies = [
        spyOn(console, 'warn').mockImplementation(() => undefined),
        spyOn(console, 'error').mockImplementation(() => undefined),
    ];
});

afterEach(async () => {
    for (const spy of spies) {
        spy.mockRestore();
    }
    await rm(dataRoot, { force: true, recursive: true });
});

test('Server cleanup waits for local writers before removing their partition', async () => {
    let releaseWriter: () => void = () => undefined;
    const writer = new Promise<void>((resolve) => {
        releaseWriter = resolve;
    }).then(() => mkdir(partition, { recursive: true }));
    const purge = purgeServerPartition({
        dataRoot,
        disk: null,
        pendingWriters: [writer],
        serverId,
    });

    releaseWriter();
    await purge;
    await expect(lstat(partition)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('Server deletion stops its work before purging the partition', async () => {
    await mkdir(partition, { recursive: true });
    const order: string[] = [];
    const work = {
        close: async () => {
            order.push(`close:${await exists(partition)}`);
            throw new Error('a session did not save');
        },
        writerSnapshot: () => [],
    };

    await deleteServerPartition(work, { dataRoot, disk: null, serverId });

    order.push(`purged:${!(await exists(partition))}`);
    expect(order).toEqual(['close:true', 'purged:true']);
});

test('volume holder waits and detach retries run outside the storage lock', async () => {
    const roots = await Promise.all(['agt_one4567890abcdef', 'agt_two4567890abcdef'].map(volume));
    await writeLedger(roots);
    const host = fakeHdiutil({
        detach: (attempt) => (attempt % 2 === 1 ? 'busy' : 'ok'),
        holders: (poll) => (poll % 2 === 0 ? holderListing([700, 'codex']) : ''),
        mounted: roots.map((root) => join(root, 'workspace')),
    });
    let unlock: () => void = () => undefined;
    let locked: () => void = () => undefined;
    const lockTaken = new Promise<void>((resolve) => {
        locked = resolve;
    });
    // Another daemon holds the lock for the whole purge, except the final ledger release.
    const holder = withStorageLock(dataRoot, async () => {
        locked();
        await new Promise<void>((resolve) => {
            unlock = resolve;
        });
    });
    await lockTaken;
    let settled = false;
    const purge = purgeServerPartition({
        dataRoot,
        disk: host.disk,
        pacing: host.pacing,
        serverId,
    }).finally(() => {
        settled = true;
    });

    await until(async () => host.mounted.size === 0 && !(await exists(partition)));
    expect(host.calls.some((call) => call.includes('-force'))).toBe(false);
    expect(settled).toBe(false);
    expect(Object.keys(await readLedger())).toEqual(roots);
    unlock();
    await Promise.all([holder, purge]);
    expect(await readLedger()).toEqual({});
});

test('a mount without a volume manifest is detached before the partition is removed', async () => {
    const stray = join(partition, 'agents', 'agt_stray567890abcdef', 'workspace');
    await mkdir(stray, { recursive: true });
    const host = fakeHdiutil({ detach: () => 'ok', mounted: [stray] });

    await purgeServerPartition({ dataRoot, disk: host.disk, pacing: host.pacing, serverId });

    expect(host.calls).toContainEqual(['hdiutil', 'detach', stray]);
    expect(host.mounted.size).toBe(0);
    expect(await exists(partition)).toBe(false);
});

test('a failed purge keeps its marker and the next attachment start finishes it', async () => {
    const root = await volume('agt_stuck67890abcdef');
    await writeLedger([root]);
    let stuck = true;
    const host = fakeHdiutil({
        detach: () => (stuck ? 'busy' : 'ok'),
        mounted: [join(root, 'workspace')],
    });
    const volumes = { dataRoot, disk: host.disk, pacing: host.pacing };

    await expect(purgeServerPartition({ ...volumes, serverId })).rejects.toThrow('still mounted');
    expect(await exists(join(partition, pendingPurgeMarker))).toBe(true);
    expect(Object.keys(await readLedger())).toEqual([root]);

    // The purging process died: its pid no longer runs.
    await writeFile(join(partition, pendingPurgeMarker), `${await exitedPid()}\n`);
    stuck = false;
    expect(await replayPendingServerPurges(volumes)).toEqual([serverId]);
    expect(await exists(partition)).toBe(false);
    expect(await readLedger()).toEqual({});
});

test('replay leaves live purges and unmarked partitions alone', async () => {
    const live = join(dataRoot, 'servers', 'srv_live567890abcdef');
    const standing = join(dataRoot, 'servers', 'srv_keep567890abcdef');
    await mkdir(live, { recursive: true });
    await mkdir(join(standing, 'agents'), { recursive: true });
    await writeFile(join(live, pendingPurgeMarker), `${process.ppid}\n`);
    await writeFile(join(standing, 'attachment.json'), '{}');

    expect(await replayPendingServerPurges({ dataRoot, disk: null })).toEqual([]);
    expect(await exists(live)).toBe(true);
    expect(await exists(join(standing, 'attachment.json'))).toBe(true);
});

async function volume(agentId: string) {
    const agentRoot = join(partition, 'agents', agentId);
    await mkdir(join(agentRoot, 'workspace'), { recursive: true });
    await writeFile(
        join(agentRoot, 'workspace-volume.json'),
        JSON.stringify({ capacityBytes: 1024, volumeUuid: 'volume-uuid' })
    );
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

async function exists(path: string) {
    return await lstat(path).then(
        () => true,
        () => false
    );
}

async function exitedPid() {
    const child = Bun.spawn(['true']);
    await child.exited;
    return child.pid;
}

async function until(condition: () => Promise<boolean>) {
    const deadline = Date.now() + 5000;
    while (!(await condition())) {
        if (Date.now() > deadline) {
            throw new Error('Condition did not hold within 5s.');
        }
        await Bun.sleep(5);
    }
}
