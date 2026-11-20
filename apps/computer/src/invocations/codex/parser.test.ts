import { describe, expect, test } from 'bun:test';
import { parsePatch } from './parser.ts';

const firstLineError = "Invalid patch: The first line of the patch must be '*** Begin Patch'";
const lastLineError = "Invalid patch: The last line of the patch must be '*** End Patch'";
const importFooPatch =
    '*** Begin Patch\n*** Update File: file2.py\n import foo\n+bar\n*** End Patch';
const importFooParsed: ReturnType<typeof parsePatch> = {
    environmentId: null,
    hunks: [
        {
            chunks: [
                {
                    changeContext: null,
                    contextLineIndices: [[0, 0]],
                    isEndOfFile: false,
                    newLines: ['import foo', 'bar'],
                    oldLines: ['import foo'],
                },
            ],
            kind: 'update',
            movePath: null,
            path: 'file2.py',
        },
    ],
};

function failure(patch: string) {
    try {
        parsePatch(patch);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error('expected the patch to be refused');
}

describe('parsePatch', () => {
    test('parses every hunk kind and refuses bad boundaries', () => {
        expect(failure('bad')).toBe(firstLineError);
        expect(failure('*** Begin Patch\nbad')).toBe(lastLineError);
        expect(
            parsePatch('*** Begin Patch \n*** Add File: foo\n+hi\n *** End Patch').hunks
        ).toEqual([{ contents: 'hi\n', kind: 'add', path: 'foo' }]);
        expect(failure('*** Begin Patch\n*** Update File: test.py\n*** End Patch')).toBe(
            "Invalid patch hunk on line 2: Update file hunk for path 'test.py' is empty"
        );
        expect(parsePatch('*** Begin Patch\n*** End Patch').hunks).toEqual([]);
        expect(
            parsePatch(
                '*** Begin Patch\n*** Add File: path/add.py\n+abc\n+def\n*** Delete File: path/delete.py\n*** Update File: path/update.py\n*** Move to: path/update2.py\n@@ def f():\n-    pass\n+    return 123\n*** End Patch'
            ).hunks
        ).toEqual([
            { contents: 'abc\ndef\n', kind: 'add', path: 'path/add.py' },
            { kind: 'delete', path: 'path/delete.py' },
            {
                chunks: [
                    {
                        changeContext: 'def f():',
                        contextLineIndices: [],
                        isEndOfFile: false,
                        newLines: ['    return 123'],
                        oldLines: ['    pass'],
                    },
                ],
                kind: 'update',
                movePath: 'path/update2.py',
                path: 'path/update.py',
            },
        ]);
    });

    test('an update hunk can be followed by another hunk', () => {
        expect(
            parsePatch(
                '*** Begin Patch\n*** Update File: file.py\n@@\n+line\n*** Add File: other.py\n+content\n*** End Patch'
            ).hunks
        ).toEqual([
            {
                chunks: [
                    {
                        changeContext: null,
                        contextLineIndices: [],
                        isEndOfFile: false,
                        newLines: ['line'],
                        oldLines: [],
                    },
                ],
                kind: 'update',
                movePath: null,
                path: 'file.py',
            },
            { contents: 'content\n', kind: 'add', path: 'other.py' },
        ]);
    });

    test('the first chunk of an update needs no @@ header', () => {
        expect(parsePatch(importFooPatch)).toEqual(importFooParsed);
    });

    test('keeps the end-of-file marker', () => {
        expect(
            parsePatch(
                '*** Begin Patch\n*** Update File: file.txt\n@@\n+quux\n*** End of File\n\n*** End Patch'
            )
        ).toEqual({
            environmentId: null,
            hunks: [
                {
                    chunks: [
                        {
                            changeContext: null,
                            contextLineIndices: [],
                            isEndOfFile: true,
                            newLines: ['quux'],
                            oldLines: [],
                        },
                    ],
                    kind: 'update',
                    movePath: null,
                    path: 'file.txt',
                },
            ],
        });
    });

    test('keeps relative and absolute hunk paths as written', () => {
        expect(
            parsePatch(
                '*** Begin Patch\n*** Add File: relative-add.py\n+content\n*** Delete File: /tmp/absolute-delete.py\n*** Update File: /tmp/absolute-update.py\n@@\n-old\n+new\n*** End Patch'
            ).hunks.map((hunk) => hunk.path)
        ).toEqual(['relative-add.py', '/tmp/absolute-delete.py', '/tmp/absolute-update.py']);
    });

    test('accepts a patch wrapped in a heredoc', () => {
        expect(parsePatch(`<<EOF\n${importFooPatch}\nEOF\n`)).toEqual(importFooParsed);
        expect(parsePatch(`<<'EOF'\n${importFooPatch}\nEOF\n`)).toEqual(importFooParsed);
        expect(parsePatch(`<<"EOF"\n${importFooPatch}\nEOF\n`)).toEqual(importFooParsed);
        expect(failure(`<<"EOF'\n${importFooPatch}\nEOF\n`)).toBe(firstLineError);
        expect(failure('<<EOF\n*** Begin Patch\n*** Update File: file2.py\nEOF\n')).toBe(
            lastLineError
        );
    });

    test('reads an environment id preamble and refuses an empty one', () => {
        expect(
            parsePatch(
                '*** Begin Patch\n*** Environment ID: remote\n*** Add File: hello.txt\n+hello\n*** End Patch'
            )
        ).toEqual({
            environmentId: 'remote',
            hunks: [{ contents: 'hello\n', kind: 'add', path: 'hello.txt' }],
        });
        expect(
            failure(
                '*** Begin Patch\n*** Environment ID:   \n*** Add File: hello.txt\n+hello\n*** End Patch'
            )
        ).toBe('Invalid patch: apply_patch environment_id cannot be empty');
        expect(
            failure(
                '*** Begin Patch\n*** Environment ID: first\n*** Environment ID: second\n*** End Patch'
            )
        ).toBe('Invalid patch: apply_patch environment_id cannot be specified more than once');
    });
});
