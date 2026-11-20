import { describe, expect, test } from 'bun:test';
import { chmod, mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyPatchIn, patchWorkspace, text, wrapPatch } from './apply-patch.test-support.ts';

const workspace = patchWorkspace();

async function exists(path: string) {
    return stat(path).then(
        () => true,
        () => false
    );
}

describe('apply_patch', () => {
    test('add file hunk creates file with contents', async () => {
        const path = join(workspace.dir, 'add.txt');
        expect(
            await applyPatchIn(workspace.dir, wrapPatch(`*** Add File: ${path}\n+ab\n+cd`))
        ).toEqual(text('completed', `Success. Updated the following files:\nA ${path}`));
        expect(await readFile(path, 'utf8')).toBe('ab\ncd\n');
    });

    test('hunks accept relative and absolute paths', async () => {
        const at = (name: string) => join(workspace.dir, name);
        await writeFile(at('relative-delete.txt'), 'delete relative\n');
        await writeFile(at('absolute-delete.txt'), 'delete absolute\n');
        await writeFile(at('relative-update.txt'), 'relative old\n');
        await writeFile(at('absolute-update.txt'), 'absolute old\n');
        const patch = wrapPatch(
            [
                '*** Add File: relative-add.txt',
                '+relative add',
                `*** Add File: ${at('absolute-add.txt')}`,
                '+absolute add',
                '*** Delete File: relative-delete.txt',
                `*** Delete File: ${at('absolute-delete.txt')}`,
                '*** Update File: relative-update.txt',
                '@@',
                '-relative old',
                '+relative new',
                `*** Update File: ${at('absolute-update.txt')}`,
                '@@',
                '-absolute old',
                '+absolute new',
            ].join('\n')
        );
        expect(await applyPatchIn(workspace.dir, patch)).toEqual(
            text(
                'completed',
                `Success. Updated the following files:\nA relative-add.txt\nA ${at('absolute-add.txt')}\nM relative-update.txt\nM ${at('absolute-update.txt')}\nD relative-delete.txt\nD ${at('absolute-delete.txt')}`
            )
        );
        expect(await readFile(at('relative-add.txt'), 'utf8')).toBe('relative add\n');
        expect(await readFile(at('absolute-add.txt'), 'utf8')).toBe('absolute add\n');
        expect(await exists(at('relative-delete.txt'))).toBe(false);
        expect(await exists(at('absolute-delete.txt'))).toBe(false);
        expect(await readFile(at('relative-update.txt'), 'utf8')).toBe('relative new\n');
        expect(await readFile(at('absolute-update.txt'), 'utf8')).toBe('absolute new\n');
    });

    test('delete file hunk removes file', async () => {
        const path = join(workspace.dir, 'del.txt');
        await writeFile(path, 'x');
        expect(await applyPatchIn(workspace.dir, wrapPatch(`*** Delete File: ${path}`))).toEqual(
            text('completed', `Success. Updated the following files:\nD ${path}`)
        );
        expect(await exists(path)).toBe(false);
    });

    test('update file hunk modifies content', async () => {
        await writeFile(join(workspace.dir, 'update.txt'), 'foo\nbar\n');
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch('*** Update File: update.txt\n@@\n foo\n-bar\n+baz')
            )
        ).toEqual(text('completed', 'Success. Updated the following files:\nM update.txt'));
        expect(await readFile(join(workspace.dir, 'update.txt'), 'utf8')).toBe('foo\nbaz\n');
    });

    test('update file hunk can move file', async () => {
        await writeFile(join(workspace.dir, 'src.txt'), 'line\n');
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch('*** Update File: src.txt\n*** Move to: dst.txt\n@@\n-line\n+line2')
            )
        ).toEqual(text('completed', 'Success. Updated the following files:\nM dst.txt'));
        expect(await exists(join(workspace.dir, 'src.txt'))).toBe(false);
        expect(await readFile(join(workspace.dir, 'dst.txt'), 'utf8')).toBe('line2\n');
    });

    test('a move whose source cannot be removed reports the destination as written', async () => {
        const locked = join(workspace.dir, 'locked');
        await mkdir(locked);
        await mkdir(join(workspace.dir, 'out'));
        await writeFile(join(locked, 'src.txt'), 'line\n');
        await chmod(locked, 0o555);
        const result = await applyPatchIn(
            workspace.dir,
            wrapPatch(
                '*** Update File: locked/src.txt\n*** Move to: out/dst.txt\n@@\n-line\n+line2'
            )
        );
        await chmod(locked, 0o755);
        expect(result).toEqual({
            ...text(
                'completed',
                `The patch was only partly applied. Could not delete ${join(locked, 'src.txt')}. Error code: EACCES.\nChanged:\n${join(workspace.dir, 'out/dst.txt')}\nNot changed:\n${join(locked, 'src.txt')}`
            ),
            exitCode: 1,
        });
        expect(await readFile(join(locked, 'src.txt'), 'utf8')).toBe('line\n');
        expect(await readFile(join(workspace.dir, 'out/dst.txt'), 'utf8')).toBe('line2\n');
    });

    test('multiple update chunks apply to a single file', async () => {
        await writeFile(join(workspace.dir, 'multi.txt'), 'foo\nbar\nbaz\nqux\n');
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch('*** Update File: multi.txt\n@@\n foo\n-bar\n+BAR\n@@\n baz\n-qux\n+QUX')
            )
        ).toEqual(text('completed', 'Success. Updated the following files:\nM multi.txt'));
        expect(await readFile(join(workspace.dir, 'multi.txt'), 'utf8')).toBe(
            'foo\nBAR\nbaz\nQUX\n'
        );
    });

    test('interleaved changes and an end-of-file append apply together', async () => {
        await writeFile(join(workspace.dir, 'interleaved.txt'), 'a\nb\nc\nd\ne\nf\n');
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch(
                    '*** Update File: interleaved.txt\n@@\n a\n-b\n+B\n@@\n c\n d\n-e\n+E\n@@\n f\n+g\n*** End of File'
                )
            )
        ).toEqual(text('completed', 'Success. Updated the following files:\nM interleaved.txt'));
        expect(await readFile(join(workspace.dir, 'interleaved.txt'), 'utf8')).toBe(
            'a\nB\nc\nd\nE\nf\ng\n'
        );
    });

    test('a pure addition chunk followed by a removal', async () => {
        await writeFile(join(workspace.dir, 'panic.txt'), 'line1\nline2\nline3\n');
        await applyPatchIn(
            workspace.dir,
            wrapPatch(
                '*** Update File: panic.txt\n@@\n+after-context\n+second-line\n@@\n line1\n-line2\n-line3\n+line2-replacement'
            )
        );
        expect(await readFile(join(workspace.dir, 'panic.txt'), 'utf8')).toBe(
            'line1\nline2-replacement\nafter-context\nsecond-line\n'
        );
    });

    test('an ASCII patch updates a line with typographic dashes', async () => {
        await writeFile(
            join(workspace.dir, 'unicode.py'),
            'import asyncio  # local import – avoids top‑level dep\n'
        );
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch(
                    '*** Update File: unicode.py\n@@\n-import asyncio  # local import - avoids top-level dep\n+import asyncio  # HELLO'
                )
            )
        ).toEqual(text('completed', 'Success. Updated the following files:\nM unicode.py'));
        expect(await readFile(join(workspace.dir, 'unicode.py'), 'utf8')).toBe(
            'import asyncio  # HELLO\n'
        );
    });

    test('a write error with nothing written fails', async () => {
        const locked = join(workspace.dir, 'locked');
        await mkdir(locked);
        await chmod(locked, 0o555);
        const result = await applyPatchIn(
            workspace.dir,
            wrapPatch('*** Add File: locked/new.txt\n+after')
        );
        await chmod(locked, 0o755);
        expect(result).toEqual(
            text(
                'failed',
                `Could not write ${join(locked, 'new.txt')}. Error code: EACCES.\nNothing was written.`
            )
        );
    });

    test('deleting a symlink removes the link and keeps its target', async () => {
        await writeFile(join(workspace.dir, 'target.txt'), 'target\n');
        await symlink(join(workspace.dir, 'target.txt'), join(workspace.dir, 'link.txt'));
        expect(await applyPatchIn(workspace.dir, wrapPatch('*** Delete File: link.txt'))).toEqual(
            text('completed', 'Success. Updated the following files:\nD link.txt')
        );
        expect(await exists(join(workspace.dir, 'link.txt'))).toBe(false);
        expect(await readFile(join(workspace.dir, 'target.txt'), 'utf8')).toBe('target\n');
    });
});
