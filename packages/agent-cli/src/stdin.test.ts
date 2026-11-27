import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const readerUrl = new URL('./stdin.ts', import.meta.url).href;
const script = `import { readAgentStdin } from ${JSON.stringify(readerUrl)}; process.stdout.write(await readAgentStdin());`;

test('Agent CLI stdin bytes keep a binary file unchanged', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x0a]);
    const piped = Bun.spawn(
        [
            'bun',
            '-e',
            `import { readAgentStdinBytes } from ${JSON.stringify(readerUrl)}; process.stdout.write((await readAgentStdinBytes()).toString('hex'));`,
        ],
        { stdin: 'pipe', stdout: 'pipe' }
    );
    piped.stdin.write(bytes);
    await piped.stdin.end();
    expect(await new Response(piped.stdout).text()).toBe(Buffer.from(bytes).toString('hex'));
    expect(await piped.exited).toBe(0);
});

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
