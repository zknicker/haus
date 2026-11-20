import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDirs: string[] = [];
afterEach(async () => {
    for (const dir of dataDirs.splice(0)) {
        await rm(dir, { force: true, recursive: true });
    }
});

test('SIGTERM closes the runner and exits cleanly while it is still connecting', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-shutdown-'));
    dataDirs.push(dataDir);
    const child = Bun.spawn(['bun', join(import.meta.dir, 'index.ts')], {
        env: {
            HAUS_RUNNER_DATA_DIR: dataDir,
            HAUS_RUNNER_TOKEN: 'runner-token-0123456789abcdef0123456789',
            HAUS_SERVER_URL: 'http://127.0.0.1:9',
            PATH: process.env.PATH,
        },
        stderr: 'pipe',
    });
    const stderr = child.stderr.getReader();
    const decoder = new TextDecoder();
    let output = '';
    while (!output.includes('Runner connecting')) {
        const chunk = await stderr.read();
        if (chunk.done) {
            break;
        }
        output += decoder.decode(chunk.value);
    }

    child.kill('SIGTERM');
    for (let chunk = await stderr.read(); !chunk.done; chunk = await stderr.read()) {
        output += decoder.decode(chunk.value);
    }

    expect(await child.exited).toBe(0);
    expect(output).toContain('Runner received SIGTERM; closing warm sessions and the Server link.');
});
