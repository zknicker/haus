import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeHausWrapper } from './wrapper.ts';

test('Haus invokes only its scoped Agent authority', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'haus-wrapper-'));
    try {
        const entrypoint = join(binDir, 'inspect.ts');
        await writeFile(
            entrypoint,
            'console.log(JSON.stringify({args:process.argv.slice(2),agent:process.env.HAUS_AGENT_ID,proxy:process.env.HAUS_SERVER_URL}));'
        );
        const wrapper = await writeHausWrapper({
            binDir,
            entrypoint: { executable: process.execPath, args: [entrypoint] },
            identity: {
                agentId: 'agent_test',
                proxyTokenFile: join(binDir, 'proxy-token'),
                proxyUrl: 'http://127.0.0.1:32123',
                serverUrl: 'https://haus.chat',
            },
        });
        expect(wrapper).toBe(join(binDir, 'haus'));
        {
            const result = Bun.spawnSync([wrapper, 'message', 'check']);
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout.toString())).toEqual({
                args: ['__agent', 'message', 'check'],
                agent: 'agent_test',
                proxy: 'http://127.0.0.1:32123',
            });
        }
    } finally {
        await rm(binDir, { force: true, recursive: true });
    }
});
