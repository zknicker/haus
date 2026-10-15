import { expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAgentRetireCommand, purgeRetiredAgent } from './agent-retirement.ts';
import { fakeHdiutil, holderListing } from './workspace-volumes/disk-fixtures.ts';
import { withStorageLock } from './workspace-volumes/storage-ledger.ts';
import { exists } from './workspace-volumes/workspace-volume.ts';

const serverId = 'srv_1234567890abcdef';
const agentId = 'agt_1234567890abcdef';

test('parses only a scoped Agent retirement command', () => {
    expect(
        parseAgentRetireCommand({
            agentId: 'agt_1234567890abcdef',
            type: 'agent-retire',
        })
    ).toEqual({ agentId: 'agt_1234567890abcdef', type: 'agent-retire' });
    expect(parseAgentRetireCommand({ agentId: '../../other', type: 'agent-retire' })).toBeNull();
});

test('retirement cleanup is idempotent and preserves standing Agent partitions', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-retirement-'));
    const retiredId = agentId;
    const standingId = 'agt_abcdef1234567890';
    const retiredRoot = join(dataRoot, 'servers', serverId, 'agents', retiredId);
    const standingRoot = join(dataRoot, 'servers', serverId, 'agents', standingId);
    try {
        await Promise.all([
            mkdir(join(retiredRoot, 'workspace'), { recursive: true }),
            mkdir(join(standingRoot, 'workspace'), { recursive: true }),
        ]);
        await Promise.all([
            writeFile(join(retiredRoot, 'workspace', 'MEMORY.md'), '# retired'),
            writeFile(join(standingRoot, 'workspace', 'MEMORY.md'), '# standing'),
        ]);

        await purgeRetiredAgent({ agentId: retiredId, dataRoot, serverId });
        await purgeRetiredAgent({ agentId: retiredId, dataRoot, serverId });

        await expect(stat(retiredRoot)).rejects.toThrow();
        await expect(stat(join(standingRoot, 'workspace', 'MEMORY.md'))).resolves.toBeTruthy();
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('retirement detaches a manifest-less mount before removing the partition', async () => {
    const dataRoot = await realpath(await mkdtemp(join(tmpdir(), 'haus-retirement-stray-')));
    const agentRoot = join(dataRoot, 'servers', serverId, 'agents', agentId);
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
        await mkdir(join(agentRoot, 'workspace'), { recursive: true });
        await writeLedger(dataRoot, { [agentRoot]: 1024 });
        const host = fakeHdiutil({ detach: () => 'ok', mounted: [join(agentRoot, 'workspace')] });

        await purgeRetiredAgent({ agentId, dataRoot, disk: host.disk, serverId });

        expect(host.calls).toContainEqual(['hdiutil', 'detach', join(agentRoot, 'workspace')]);
        await expect(stat(agentRoot)).rejects.toThrow();
        expect(await readAllocations(dataRoot)).toEqual({});
    } finally {
        warn.mockRestore();
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('retirement replay releases a reservation leaked after its partition was removed', async () => {
    const dataRoot = await realpath(await mkdtemp(join(tmpdir(), 'haus-retirement-leak-')));
    const agentRoot = join(dataRoot, 'servers', serverId, 'agents', agentId);
    const standing = join(dataRoot, 'servers', serverId, 'agents', 'agt_abcdef1234567890');
    try {
        // An earlier purge removed the partition, then failed to release the ledger.
        await writeLedger(dataRoot, { [agentRoot]: 1024, [standing]: 1024 });

        await purgeRetiredAgent({ agentId, dataRoot, disk: null, serverId });

        expect(await readAllocations(dataRoot)).toEqual({ [standing]: 1024 });
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('retirement waits for volume holders outside the storage lock', async () => {
    const dataRoot = await realpath(await mkdtemp(join(tmpdir(), 'haus-retirement-lock-')));
    const agentRoot = join(dataRoot, 'servers', serverId, 'agents', agentId);
    try {
        await mkdir(join(agentRoot, 'workspace'), { recursive: true });
        await writeFile(
            join(agentRoot, 'workspace-volume.json'),
            JSON.stringify({ capacityBytes: 1024, volumeUuid: 'volume-uuid' })
        );
        await writeLedger(dataRoot, { [agentRoot]: 1024 });
        const host = fakeHdiutil({
            detach: (attempt) => (attempt === 1 ? 'busy' : 'ok'),
            holders: (poll) => (poll === 0 ? holderListing([63_647, 'codex']) : ''),
            mounted: [join(agentRoot, 'workspace')],
        });
        let unlock: () => void = () => undefined;
        let locked: () => void = () => undefined;
        const lockTaken = new Promise<void>((resolve) => {
            locked = resolve;
        });
        const holder = withStorageLock(dataRoot, async () => {
            locked();
            await new Promise<void>((resolve) => {
                unlock = resolve;
            });
        });
        await lockTaken;

        const purge = purgeRetiredAgent({
            agentId,
            dataRoot,
            disk: host.disk,
            pacing: host.pacing,
            serverId,
        });
        const deadline = Date.now() + 5000;
        while (host.mounted.size > 0 || (await exists(agentRoot))) {
            expect(Date.now()).toBeLessThan(deadline);
            await Bun.sleep(5);
        }

        expect(await readAllocations(dataRoot)).toEqual({ [agentRoot]: 1024 });
        unlock();
        await Promise.all([holder, purge]);
        expect(await readAllocations(dataRoot)).toEqual({});
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

for (const scenario of ['busy then detached', 'never detaches'] as const) {
    test(`retirement with a volume that is ${scenario} releases capacity only once detached`, async () => {
        const dataRoot = await realpath(await mkdtemp(join(tmpdir(), 'haus-retirement-volume-')));
        const agentRoot = join(dataRoot, 'servers', serverId, 'agents', agentId);
        const ledger = join(dataRoot, 'workspace-storage.json');
        const warn = spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            await mkdir(join(agentRoot, 'workspace'), { recursive: true });
            await writeFile(
                join(agentRoot, 'workspace-volume.json'),
                JSON.stringify({ capacityBytes: 1024, volumeUuid: 'volume-uuid' })
            );
            await writeFile(
                ledger,
                JSON.stringify({ allocations: { [agentRoot]: 1024 }, budgetBytes: 1024 ** 3 })
            );
            const host = fakeHdiutil({
                detach: (attempt) =>
                    scenario === 'busy then detached' && attempt > 1 ? 'ok' : 'busy',
                holders: (poll) => (poll === 0 ? holderListing([63_647, 'codex']) : ''),
                mounted: [join(agentRoot, 'workspace')],
            });

            const purge = purgeRetiredAgent({
                agentId,
                dataRoot,
                disk: host.disk,
                pacing: host.pacing,
                serverId,
            });

            if (scenario === 'busy then detached') {
                await purge;
                await expect(stat(agentRoot)).rejects.toThrow();
                expect(JSON.parse(await readFile(ledger, 'utf8')).allocations).toEqual({});
            } else {
                await expect(purge).rejects.toThrow('still mounted');
                expect(host.calls.some((call) => call.includes('-force'))).toBe(true);
                await expect(stat(join(agentRoot, 'workspace-volume.json'))).resolves.toBeTruthy();
                expect(JSON.parse(await readFile(ledger, 'utf8')).allocations).toEqual({
                    [agentRoot]: 1024,
                });
            }
        } finally {
            warn.mockRestore();
            await rm(dataRoot, { force: true, recursive: true });
        }
    });
}

async function writeLedger(dataRoot: string, allocations: Record<string, number>) {
    await writeFile(
        join(dataRoot, 'workspace-storage.json'),
        JSON.stringify({ allocations, budgetBytes: 1024 ** 3 })
    );
}

async function readAllocations(dataRoot: string): Promise<Record<string, number>> {
    return JSON.parse(await readFile(join(dataRoot, 'workspace-storage.json'), 'utf8')).allocations;
}
