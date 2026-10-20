import { expect, test } from 'bun:test';
import { isRunning, killQuietly } from '../testing/process-group-testing.ts';
import { spawnCodexProcess } from './codex-transport.ts';

function spawnOrphaningLeader() {
    const transport = spawnCodexProcess({
        args: ['-c', 'sleep 60 >/dev/null 2>&1 & echo "$!"'],
        cwd: '/',
        env: { PATH: process.env.PATH ?? '' },
        executable: '/bin/sh',
    });
    const grandchild = new Promise<number>((resolve) =>
        transport.onLine((line) => resolve(Number(line)))
    );
    return { grandchild, transport };
}

test('kill after the app-server exited still ends its process group', async () => {
    const { grandchild, transport } = spawnOrphaningLeader();
    const pid = await grandchild;
    try {
        await transport.exited;
        await transport.kill();
        expect(isRunning(pid)).toBe(false);
    } finally {
        killQuietly(pid);
    }
});

test('an app-server that exits on its own takes its process group down', async () => {
    const { grandchild, transport } = spawnOrphaningLeader();
    const pid = await grandchild;
    try {
        await transport.exited;
        const deadline = Date.now() + 5000;
        while (isRunning(pid) && Date.now() < deadline) {
            await Bun.sleep(20);
        }
        expect(isRunning(pid)).toBe(false);
    } finally {
        killQuietly(pid);
    }
});
