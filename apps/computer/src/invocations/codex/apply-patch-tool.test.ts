import { describe, expect, test } from 'bun:test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyPatchIn, patchWorkspace, text, wrapPatch } from './apply-patch.test-support.ts';

const workspace = patchWorkspace();

async function updates(name: string, original: string, patch: string, expected: string) {
    await writeFile(join(workspace.dir, name), original);
    expect(await applyPatchIn(workspace.dir, patch)).toEqual(
        text('completed', `Success. Updated the following files:\nM ${name}`)
    );
    expect(await readFile(join(workspace.dir, name), 'utf8')).toBe(expected);
}

async function refuses(patch: string, message: string) {
    expect(await applyPatchIn(workspace.dir, patch)).toEqual(text('failed', message));
}

describe('apply_patch tool', () => {
    test('applies multiple operations', async () => {
        await writeFile(join(workspace.dir, 'modify.txt'), 'line1\nline2\n');
        await writeFile(join(workspace.dir, 'delete.txt'), 'obsolete\n');
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch(
                    '*** Add File: nested/new.txt\n+created\n*** Delete File: delete.txt\n*** Update File: modify.txt\n@@\n-line2\n+changed'
                )
            )
        ).toEqual(
            text(
                'completed',
                'Success. Updated the following files:\nA nested/new.txt\nM modify.txt\nD delete.txt'
            )
        );
        expect(await readFile(join(workspace.dir, 'nested/new.txt'), 'utf8')).toBe('created\n');
        expect(await readFile(join(workspace.dir, 'modify.txt'), 'utf8')).toBe('line1\nchanged\n');
    });

    test('adds a file, then updates it in a second patch', async () => {
        expect(
            await applyPatchIn(workspace.dir, wrapPatch('*** Add File: cli_test.txt\n+hello'))
        ).toEqual(text('completed', 'Success. Updated the following files:\nA cli_test.txt'));
        await updates(
            'cli_test.txt',
            'hello\n',
            wrapPatch('*** Update File: cli_test.txt\n@@\n-hello\n+world'),
            'world\n'
        );
    });

    test('applies multiple chunks', () =>
        updates(
            'multi.txt',
            'line1\nline2\nline3\nline4\n',
            wrapPatch('*** Update File: multi.txt\n@@\n-line2\n+changed2\n@@\n-line4\n+changed4'),
            'line1\nchanged2\nline3\nchanged4\n'
        ));

    test('replaces the first line, the last line, and appends at the end of file', async () => {
        await updates(
            'first.txt',
            'foo\nbar\nbaz\n',
            wrapPatch('*** Update File: first.txt\n@@\n-foo\n+FOO\n bar\n'),
            'FOO\nbar\nbaz\n'
        );
        await updates(
            'last.txt',
            'foo\nbar\nbaz\n',
            wrapPatch('*** Update File: last.txt\n@@\n foo\n bar\n-baz\n+BAZ\n'),
            'foo\nbar\nBAZ\n'
        );
        await updates(
            'insert.txt',
            'foo\nbar\nbaz\n',
            wrapPatch('*** Update File: insert.txt\n@@\n+quux\n*** End of File\n'),
            'foo\nbar\nbaz\nquux\n'
        );
    });

    test('rejects overlapping end-of-file chunks', async () => {
        await writeFile(join(workspace.dir, 'overlapping.txt'), 'one\n');
        await refuses(
            wrapPatch(
                '*** Update File: overlapping.txt\n@@\n-one\n+first\n@@\n-one\n+second\n*** End of File'
            ),
            `Failed to find expected lines in ${join(workspace.dir, 'overlapping.txt')}:\none`
        );
        expect(await readFile(join(workspace.dir, 'overlapping.txt'), 'utf8')).toBe('one\n');
    });

    test('keeps the line endings of the target file', async () => {
        const between = '*** Update File: %s\n@@\n-one\n+uno\n@@\n two\n+\n+between\n three';
        await updates(
            'crlf.txt',
            'one\r\ntwo\r\nthree\r\n',
            wrapPatch(between.replace('%s', 'crlf.txt')),
            'uno\r\ntwo\r\n\r\nbetween\r\nthree\r\n'
        );
        await updates(
            'cr.txt',
            'one\rtwo\rthree\r',
            wrapPatch(between.replace('%s', 'cr.txt')),
            'uno\rtwo\r\rbetween\rthree\r'
        );
        await updates(
            'trailing_blank.txt',
            'a\r\n\r\n',
            wrapPatch('*** Update File: trailing_blank.txt\n@@\n+new'),
            'a\r\n\r\nnew\r\n'
        );
        await updates(
            'repeated_context.txt',
            'same\r\nsame\n',
            wrapPatch('*** Update File: repeated_context.txt\n@@\n-same\n same'),
            'same\n'
        );
        await updates(
            'mixed.txt',
            'one\r\ntwo\rthree\nfour\r\n',
            wrapPatch('*** Update File: mixed.txt\n@@\n one\n two\n-three\n+THREE\n four'),
            'one\r\ntwo\rTHREE\r\nfour\r\n'
        );
        await updates(
            'no_trailing_newline.txt',
            'one\r\ntwo',
            wrapPatch('*** Update File: no_trailing_newline.txt\n@@\n-one\n+ONE'),
            'ONE\r\ntwo\r\n'
        );
    });

    test('keeps the order of changes among repeated lines', () =>
        updates(
            'repeated.txt',
            'a\nb\n',
            wrapPatch('*** Update File: repeated.txt\n@@\n-a\n-b\n+b\n+b\n+a'),
            'b\nb\na\n'
        ));

    test('appends a trailing newline to an updated file', () =>
        updates(
            'no_newline.txt',
            'no newline at end',
            wrapPatch(
                '*** Update File: no_newline.txt\n@@\n-no newline at end\n+first line\n+second line'
            ),
            'first line\nsecond line\n'
        ));

    test('moves a file into a new directory', async () => {
        await mkdir(join(workspace.dir, 'old'));
        await writeFile(join(workspace.dir, 'old/name.txt'), 'old content\n');
        expect(
            await applyPatchIn(
                workspace.dir,
                wrapPatch(
                    '*** Update File: old/name.txt\n*** Move to: renamed/dir/name.txt\n@@\n-old content\n+new content'
                )
            )
        ).toEqual(
            text('completed', 'Success. Updated the following files:\nM renamed/dir/name.txt')
        );
        expect(await readFile(join(workspace.dir, 'renamed/dir/name.txt'), 'utf8')).toBe(
            'new content\n'
        );
    });

    test('refuses with the reason Codex gives', async () => {
        await writeFile(join(workspace.dir, 'modify.txt'), 'line1\nline2\n');
        await mkdir(join(workspace.dir, 'dir'));
        await refuses('*** Begin Patch\n*** End Patch', 'No files were modified.');
        await refuses(
            wrapPatch('*** Update File: modify.txt\n@@\n-missing\n+changed'),
            `Failed to find expected lines in ${join(workspace.dir, 'modify.txt')}:\nmissing`
        );
        await refuses(
            wrapPatch('*** Delete File: missing.txt'),
            `Failed to delete file ${join(workspace.dir, 'missing.txt')}`
        );
        await refuses(
            wrapPatch('*** Delete File: dir'),
            `Failed to delete file ${join(workspace.dir, 'dir')}`
        );
        await refuses(
            wrapPatch('*** Update File: foo.txt'),
            "Invalid patch hunk on line 2: Update file hunk for path 'foo.txt' is empty"
        );
        await refuses(
            wrapPatch('*** Update File: missing.txt\n@@\n-old\n+new'),
            `Failed to read file to update ${join(workspace.dir, 'missing.txt')}: No such file or directory (os error 2)`
        );
        await refuses(
            wrapPatch('*** Frobnicate File: foo'),
            "Invalid patch hunk on line 2: '*** Frobnicate File: foo' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'"
        );
        expect(await readFile(join(workspace.dir, 'modify.txt'), 'utf8')).toBe('line1\nline2\n');
    });
});
