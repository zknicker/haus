import { describe, expect, test } from 'bun:test';
import { chmod, mkdir, readFile, readlink, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyPatchIn, patchWorkspace, text, wrapPatch } from './apply-patch.test-support.ts';

const workspace = patchWorkspace();
const at = (path: string) => join(workspace.dir, path);

describe('apply_patch commits all or nothing', () => {
    test('a hunk that fails on the second file leaves the first file untouched', async () => {
        await writeFile(at('first.txt'), 'one\n');
        await writeFile(at('second.txt'), 'two\n');
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch(
                    '*** Add File: added.txt\n+new\n*** Update File: first.txt\n@@\n-one\n+ONE\n*** Update File: second.txt\n@@\n-missing\n+TWO'
                )
            )
        ).toEqual(text('failed', `Failed to find expected lines in ${at('second.txt')}:\nmissing`));
        expect(await readFile(at('first.txt'), 'utf8')).toBe('one\n');
        expect(
            await stat(at('added.txt')).catch((error: NodeJS.ErrnoException) => error.code)
        ).toBe('ENOENT');
    });

    test('a cancel or timeout before the write phase writes nothing', async () => {
        await writeFile(at('file.txt'), 'one\n');
        const patch = wrapPatch('*** Update File: file.txt\n@@\n-one\n+two');
        const cancel = new AbortController();
        cancel.abort('cancel');
        expect(await applyPatchIn(workspace.dir, patch, { signal: cancel.signal })).toEqual(
            text('cancelled', 'Stopped before applying the patch. Nothing was written.')
        );
        const timeout = new AbortController();
        timeout.abort('timeout');
        expect(await applyPatchIn(workspace.dir, patch, { signal: timeout.signal })).toEqual(
            text('timed-out', 'Stopped before applying the patch. Nothing was written.')
        );
        expect(await readFile(at('file.txt'), 'utf8')).toBe('one\n');
    });

    test('a CRLF file keeps CRLF while a new file is written with LF', async () => {
        await writeFile(at('windows.txt'), 'alpha\r\nbeta\r\n');
        await applyPatchIn(
            workspace.dir,
            wrapPatch(
                '*** Update File: windows.txt\n@@\n alpha\n-beta\n+BETA\n+gamma\n*** Add File: unix.txt\n+one\n+two'
            )
        );
        expect(await readFile(at('windows.txt'), 'utf8')).toBe('alpha\r\nBETA\r\ngamma\r\n');
        expect(await readFile(at('unix.txt'), 'utf8')).toBe('one\ntwo\n');
    });

    test('a moved file keeps its mode and an updated symlink keeps pointing at its target', async () => {
        await writeFile(at('run.sh'), 'echo one\n');
        await chmod(at('run.sh'), 0o755);
        await writeFile(at('target.txt'), 'old\n');
        await symlink(at('target.txt'), at('link.txt'));
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch(
                    '*** Update File: run.sh\n*** Move to: bin/run.sh\n@@\n-echo one\n+echo two\n*** Update File: link.txt\n@@\n-old\n+new'
                )
            )
        ).toEqual(
            text('completed', 'Success. Updated the following files:\nM bin/run.sh\nM link.txt')
        );
        expect((await stat(at('bin/run.sh'))).mode & 0o777).toBe(0o755);
        expect(await readFile(at('bin/run.sh'), 'utf8')).toBe('echo two\n');
        expect(await readlink(at('link.txt'))).toBe(at('target.txt'));
        expect(await readFile(at('target.txt'), 'utf8')).toBe('new\n');
    });

    test('a failed move write leaves every source in place', async () => {
        await writeFile(at('source.txt'), 'one\n');
        await writeFile(at('doomed.txt'), 'doomed\n');
        await mkdir(at('locked'));
        await chmod(at('locked'), 0o555);
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch(
                    '*** Delete File: doomed.txt\n*** Add File: added.txt\n+new\n*** Update File: source.txt\n@@\n-one\n+two\n*** Update File: source.txt\n*** Move to: locked/moved.txt\n@@\n-two\n+three'
                )
            )
        ).toEqual({
            ...text(
                'completed',
                [
                    `The patch was only partly applied. Could not write ${at('locked/moved.txt')}. Error code: EACCES.`,
                    'Changed:',
                    at('added.txt'),
                    'Not changed:',
                    at('locked/moved.txt'),
                    at('doomed.txt'),
                    at('source.txt'),
                ].join('\n')
            ),
            exitCode: 1,
        });
        await chmod(at('locked'), 0o755);
        expect(await readFile(at('source.txt'), 'utf8')).toBe('one\n');
        expect(await readFile(at('doomed.txt'), 'utf8')).toBe('doomed\n');
        expect(await readFile(at('added.txt'), 'utf8')).toBe('new\n');
    });

    test('refuses to add over an existing file or move onto one', async () => {
        await writeFile(at('kept.txt'), 'kept\n');
        await writeFile(at('source.txt'), 'source\n');
        expect(
            await applyPatchIn(workspace.dir, wrapPatch('*** Add File: kept.txt\n+new'))
        ).toEqual(text('failed', `Failed to add file ${at('kept.txt')}: the file already exists`));
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch('*** Update File: source.txt\n*** Move to: kept.txt\n@@\n-source\n+moved')
            )
        ).toEqual(
            text(
                'failed',
                `Failed to move ${at('source.txt')} to ${at('kept.txt')}: the file already exists`
            )
        );
        expect(await readFile(at('kept.txt'), 'utf8')).toBe('kept\n');
        expect(await readFile(at('source.txt'), 'utf8')).toBe('source\n');
    });

    test('later hunks see the changes of earlier hunks in the same patch', async () => {
        await writeFile(at('replaced.txt'), 'before\n');
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch(
                    '*** Add File: fresh.txt\n+draft\n*** Update File: fresh.txt\n@@\n-draft\n+final\n*** Delete File: replaced.txt\n*** Add File: replaced.txt\n+after'
                )
            )
        ).toEqual(
            text(
                'completed',
                'Success. Updated the following files:\nA fresh.txt\nA replaced.txt\nM fresh.txt\nD replaced.txt'
            )
        );
        expect(await readFile(at('fresh.txt'), 'utf8')).toBe('final\n');
        expect(await readFile(at('replaced.txt'), 'utf8')).toBe('after\n');
    });

    test('resolves patch paths against the given cwd', async () => {
        await mkdir(at('project/src'), { recursive: true });
        await writeFile(at('project/src/main.txt'), 'old\n');
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch('*** Update File: src/main.txt\n@@\n-old\n+new'),
                { cwd: 'project' }
            )
        ).toEqual(text('completed', 'Success. Updated the following files:\nM src/main.txt'));
        expect(await readFile(at('project/src/main.txt'), 'utf8')).toBe('new\n');
    });

    test('refuses to update a file that is not UTF-8 text', async () => {
        await writeFile(at('binary.dat'), new Uint8Array([0xff, 0xfe, 0xfd, 0x0a]));
        expect(
            await applyPatchIn(workspace.dir, wrapPatch('*** Update File: binary.dat\n@@\n-x\n+y'))
        ).toEqual(
            text(
                'failed',
                `Failed to read file to update ${at('binary.dat')}: stream did not contain valid UTF-8`
            )
        );
    });
});
