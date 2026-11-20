import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const readerUrl = new URL('./stdin.ts', import.meta.url).href;
const script = `import { readAgentStdin } from ${JSON.stringify(readerUrl)}; process.stdout.write(await readAgentStdin());`;

test('Agent CLI stdin reads both a pipe and a seekable redirected file', async () => {
    const piped = Bun.spawn(['bun', '-e', script], { stdin: 'pipe', stdout: 'pipe' });
    piped.stdin.write('from pipe');
    await piped.stdin.end();
    expect(await new Response(piped.stdout).text()).toBe('from pipe');
    expect(await piped.exited).toBe(0);

    const directory = await mkdtemp(join(tmpdir(), 'haus-stdin-'));
    try {
        const path = join(directory, 'body.txt');
        await writeFile(path, 'from redirected file');
        const redirected = Bun.spawn(['bun', '-e', script], {
            stdin: Bun.file(path),
            stdout: 'pipe',
        });
        expect(await new Response(redirected.stdout).text()).toBe('from redirected file');
        expect(await redirected.exited).toBe(0);
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
});
