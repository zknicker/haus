import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EditorCommand } from '@haus/api';
import { editRunner } from './editor.ts';
import { inlinePayloads, type OperationResult } from './operation.ts';

let testDir = '';

beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'haus-editor-'));
});

afterEach(async () => {
    await rm(testDir, { force: true, recursive: true });
});

function run(edit: EditorCommand, signal = new AbortController().signal) {
    return editRunner(
        { edit, kind: 'edit' },
        {
            agentId: 'agent_editor',
            cwd: testDir,
            env: { HOME: join(testDir, 'home') },
            invocationId: 'invocation_editor',
            logPath: join(testDir, 'invocation.log'),
            payloads: inlinePayloads,
            signal,
            timeoutMs: 30_000,
        }
    );
}

function text(outcome: OperationResult['outcome'], body: string, truncated = false) {
    return { outcome, output: { kind: 'text' as const, text: body }, truncated };
}

describe('view', () => {
    test('numbers every line of a text file', async () => {
        await writeFile(join(testDir, 'notes.txt'), 'alpha\r\nbeta\ngamma\n');
        expect(await run({ command: 'view', path: 'notes.txt' })).toEqual(
            text('completed', '     1\talpha\n     2\tbeta\n     3\tgamma')
        );
    });

    test('shows only the requested range, with -1 reading to the end', async () => {
        await writeFile(join(testDir, 'notes.txt'), 'one\ntwo\nthree\nfour\n');
        expect(await run({ command: 'view', path: 'notes.txt', view_range: [2, 3] })).toEqual(
            text('completed', '     2\ttwo\n     3\tthree')
        );
        expect(await run({ command: 'view', path: 'notes.txt', view_range: [3, -1] })).toEqual(
            text('completed', '     3\tthree\n     4\tfour')
        );
    });

    test('refuses a range outside the file', async () => {
        await writeFile(join(testDir, 'notes.txt'), 'one\ntwo\n');
        expect(await run({ command: 'view', path: 'notes.txt', view_range: [3, -1] })).toEqual(
            text(
                'failed',
                'Invalid view_range [3, -1]: line 3 is beyond the end of the file (2 lines).'
            )
        );
        expect(await run({ command: 'view', path: 'notes.txt', view_range: [1, 5] })).toEqual(
            text(
                'failed',
                'Invalid view_range [1, 5]: line 5 is beyond the end of the file (2 lines).'
            )
        );
        expect(await run({ command: 'view', path: 'notes.txt', view_range: [2, 1] })).toEqual(
            text(
                'failed',
                'Invalid view_range [2, 1]: the end line must be -1 or at least the start line.'
            )
        );
    });

    test('caps a long file at 2,000 lines and names the range to continue', async () => {
        const lines = Array.from({ length: 2500 }, (_, index) => `line ${index + 1}`);
        await writeFile(join(testDir, 'long.txt'), `${lines.join('\n')}\n`);
        const result = await run({ command: 'view', path: 'long.txt' });
        const shown = result.output.kind === 'text' ? result.output.text.split('\n') : [];
        expect(result.truncated).toBe(true);
        expect(shown.length).toBe(2002);
        expect(shown[1999]).toBe('  2000\tline 2000');
        expect(shown.at(-1)).toBe(
            '[Showing lines 1-2000 of 2500. Use view_range [2001, -1] to continue.]'
        );
    });

    test('lists non-hidden entries two levels deep with directories marked', async () => {
        await mkdir(join(testDir, 'src', 'deep', 'deeper'), { recursive: true });
        await mkdir(join(testDir, '.git'));
        await writeFile(join(testDir, 'README.md'), '');
        await writeFile(join(testDir, '.env'), '');
        await writeFile(join(testDir, 'src', 'index.ts'), '');
        await writeFile(join(testDir, 'src', 'deep', 'hidden-by-depth.ts'), '');
        expect(await run({ command: 'view', path: '.' })).toEqual(
            text(
                'completed',
                'Files and directories up to 2 levels deep in ., excluding hidden items:\nREADME.md\nsrc/\nsrc/deep/\nsrc/index.ts'
            )
        );
    });

    test('returns an image file as image bytes', async () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
        await writeFile(join(testDir, 'pixel.png'), png);
        expect(await run({ command: 'view', path: 'pixel.png' })).toEqual({
            outcome: 'completed' as const,
            output: { base64: png.toString('base64'), kind: 'inline', mediaType: 'image/png' },
            truncated: false,
        });
    });

    test('names the error code for a missing path', async () => {
        expect(await run({ command: 'view', path: 'missing.txt' })).toEqual(
            text('failed', 'Could not read file: missing.txt. Error code: ENOENT.')
        );
    });
});

describe('create', () => {
    test('creates parent directories and reports a new file', async () => {
        expect(
            await run({ command: 'create', file_text: 'hi\n', path: 'nested/dir/new.txt' })
        ).toEqual(text('completed', 'File created successfully at: nested/dir/new.txt'));
        expect(await readFile(join(testDir, 'nested', 'dir', 'new.txt'), 'utf-8')).toBe('hi\n');
    });

    test('overwrites an existing file, keeping its mode', async () => {
        const path = join(testDir, 'script.sh');
        await writeFile(path, 'old', { mode: 0o755 });
        expect(await run({ command: 'create', file_text: 'new', path })).toEqual(
            text('completed', `File overwritten at: ${path}`)
        );
        expect(await readFile(path, 'utf-8')).toBe('new');
        expect((await stat(path)).mode & 0o777).toBe(0o755);
    });

    test('expands ~ to the home directory', async () => {
        await run({ command: 'create', file_text: 'home', path: '~/note.txt' });
        expect(await readFile(join(testDir, 'home', 'note.txt'), 'utf-8')).toBe('home');
    });

    test('writes through a symlink without replacing it', async () => {
        await writeFile(join(testDir, 'target.txt'), 'old');
        await symlink(join(testDir, 'target.txt'), join(testDir, 'link.txt'));
        await run({ command: 'create', file_text: 'new', path: 'link.txt' });
        expect(await readFile(join(testDir, 'target.txt'), 'utf-8')).toBe('new');
        expect((await readdir(testDir)).sort()).toEqual(['link.txt', 'target.txt']);
    });

    test('writes nothing once the invocation is stopped', async () => {
        const path = join(testDir, 'kept.txt');
        await writeFile(path, 'original');
        expect(
            await run(
                { command: 'create', file_text: 'new', path: 'kept.txt' },
                AbortSignal.abort('timeout')
            )
        ).toEqual(text('timed-out', 'Stopped before writing kept.txt. Nothing was written.'));
        expect(await readFile(path, 'utf-8')).toBe('original');
        expect(await readdir(testDir)).toEqual(['kept.txt']);
    });
});

describe('str_replace', () => {
    test('writes nothing once the invocation is cancelled', async () => {
        const path = join(testDir, 'kept.txt');
        await writeFile(path, 'Hello, world!');
        const stopped = await run(
            { command: 'str_replace', new_str: 'there', old_str: 'world', path: 'kept.txt' },
            AbortSignal.abort('cancel')
        );
        expect(stopped).toEqual(
            text('cancelled', 'Stopped before writing kept.txt. Nothing was written.')
        );
        expect(await readFile(path, 'utf-8')).toBe('Hello, world!');
    });
});

describe('insert', () => {
    const cases = [
        { name: 'at the top', original: 'a\nb\n', line: 0, insert: 'x', written: 'x\na\nb\n' },
        {
            name: 'between lines',
            original: 'a\nb\n',
            line: 1,
            insert: 'x\ny\n',
            written: 'a\nx\ny\nb\n',
        },
        {
            name: 'after the last line',
            original: 'a\nb\n',
            line: 2,
            insert: 'x',
            written: 'a\nb\nx\n',
        },
        {
            name: 'after an unterminated last line',
            original: 'a\nb',
            line: 2,
            insert: 'x',
            written: 'a\nb\nx',
        },
        {
            name: 'with CRLF endings',
            original: 'a\r\nb\r\n',
            line: 1,
            insert: 'x\ny',
            written: 'a\r\nx\r\ny\r\nb\r\n',
        },
        {
            name: 'before a BOM line',
            original: '\uFEFFa\n',
            line: 0,
            insert: 'x',
            written: '\uFEFFx\na\n',
        },
    ];

    for (const { name, original, line, insert, written } of cases) {
        test(`inserts ${name}`, async () => {
            const path = join(testDir, 'file.txt');
            await writeFile(path, original);
            const result = await run({
                command: 'insert',
                insert_line: line,
                new_str: insert,
                path: 'file.txt',
            });
            expect(result.outcome).toBe('completed');
            expect(await readFile(path, 'utf-8')).toBe(written);
        });
    }

    test('reports how many lines it inserted', async () => {
        await writeFile(join(testDir, 'file.txt'), 'a\n');
        expect(
            await run({ command: 'insert', insert_line: 1, new_str: 'x\ny', path: 'file.txt' })
        ).toEqual(text('completed', 'Inserted 2 line(s) after line 1 in file.txt.'));
    });

    test('refuses a line past the end of the file', async () => {
        await writeFile(join(testDir, 'file.txt'), 'a\nb\n');
        expect(
            await run({ command: 'insert', insert_line: 3, new_str: 'x', path: 'file.txt' })
        ).toEqual(
            text('failed', 'Invalid insert_line 3: file.txt has 2 lines. Use a line from 0 to 2.')
        );
    });
});
