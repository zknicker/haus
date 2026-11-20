import { describe, expect, test } from 'bun:test';
import { type Hunk, parsePatch } from './parser.ts';

const hunkHeaders =
    "Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'";
const lineStarts =
    "Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)";

function failure(patch: string) {
    try {
        parsePatch(patch);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error('expected the patch to be refused');
}

function chunk(
    oldLines: string[],
    newLines: string[],
    contextLineIndices: [number, number][] = []
) {
    return { changeContext: null, contextLineIndices, isEndOfFile: false, newLines, oldLines };
}

describe('patch lines', () => {
    test('reads every hunk of a long patch in order', () => {
        const patch = `*** Begin Patch
*** Add File: docs/release-notes.md
+# Release notes
+
+## CLI
*** Update File: src/config.rs
@@ impl Config
-    pub apply_patch_progress: bool,
+    pub stream_apply_patch_progress: bool,
     pub include_diagnostics: bool,
@@ fn default_progress_interval()
-    Duration::from_millis(500)
+    Duration::from_millis(250)
*** Delete File: src/legacy_patch_progress.rs
*** Update File: crates/cli/src/main.rs
*** Move to: crates/cli/src/bin/codex.rs
@@ fn run()
-    let args = Args::parse();
+    let cli = Cli::parse();
*** Add File: tests/fixtures/apply_patch_progress.json
+{
+}
*** Update File: README.md
@@ Development workflow
 Build the Rust workspace before opening a pull request.
+When touching streamed tool calls, include parser coverage for partial input.
*** Delete File: docs/old-apply-patch-progress.md
*** End Patch`;
        expect(
            parsePatch(patch).hunks.map((hunk) =>
                hunk.kind === 'update' && hunk.movePath !== null ? 'move-update' : hunk.kind
            )
        ).toEqual(['add', 'update', 'delete', 'move-update', 'add', 'update', 'delete']);
    });

    test('keeps an indented update marker as a context line', () => {
        expect(
            parsePatch(
                '*** Begin Patch\n*** Update File: a.txt\n@@\n-old a\n+new a\n *** Update File: b.txt\n@@\n-old b\n+new b\n*** End Patch\n'
            ).hunks
        ).toEqual([
            {
                chunks: [
                    chunk(
                        ['old a', '*** Update File: b.txt'],
                        ['new a', '*** Update File: b.txt'],
                        [[1, 1]]
                    ),
                    chunk(['old b'], ['new b']),
                ],
                kind: 'update',
                movePath: null,
                path: 'a.txt',
            },
        ]);
    });

    test('reads a bare empty line in an update as an empty context line', () => {
        expect(
            parsePatch(
                '*** Begin Patch\n*** Update File: file.txt\n@@\n context before\n\n context after\n*** End Patch\n'
            ).hunks
        ).toEqual([
            {
                chunks: [
                    chunk(
                        ['context before', '', 'context after'],
                        ['context before', '', 'context after'],
                        [
                            [0, 0],
                            [1, 1],
                            [2, 2],
                        ]
                    ),
                ],
                kind: 'update',
                movePath: null,
                path: 'file.txt',
            },
        ]);
    });

    test('reads CRLF patch lines and strips one more trailing carriage return', () => {
        const expected: Hunk[] = [
            { chunks: [chunk(['old'], ['new'])], kind: 'update', movePath: null, path: 'file.txt' },
        ];
        expect(
            parsePatch(
                '*** Begin Patch\r\n*** Update File: file.txt\r\n@@\r\n-old\r\n+new\r\n*** End Patch\r\n'
            ).hunks
        ).toEqual(expected);
        expect(
            parsePatch(
                '*** Begin Patch\r\n*** Update File: file.txt\r\n@@\r\n-old\r\r\n+new\r\n*** End Patch\r\n'
            ).hunks
        ).toEqual(expected);
    });

    test('takes an indented last line as the end of the patch', () => {
        expect(
            parsePatch('*** Begin Patch\n*** Update File: file.txt\n@@\n-old\n+new\n *** End Patch')
                .hunks
        ).toEqual([
            { chunks: [chunk(['old'], ['new'])], kind: 'update', movePath: null, path: 'file.txt' },
        ]);
    });

    test('allows only blank lines after the end of the patch', () => {
        expect(
            failure('*** Begin Patch\n*** Add File: file.txt\n+hello\n*** End Patch\nextra\n')
        ).toBe("Invalid patch: The last line of the patch must be '*** End Patch'");
        expect(
            failure(
                '*** Begin Patch\n*** Add File: file.txt\n+hello\n*** End Patch\nextra\n*** End Patch'
            )
        ).toBe("Invalid patch: The last line of the patch must be '*** End Patch'");
        expect(
            parsePatch('*** Begin Patch\n*** Add File: file.txt\n+hello\n*** End Patch\n \t\n')
                .hunks
        ).toEqual([{ contents: 'hello\n', kind: 'add', path: 'file.txt' }]);
    });

    test('names the line and the reason for every malformed hunk', () => {
        expect(failure('*** Begin Patch\nbad\n*** End Patch')).toBe(
            `Invalid patch hunk on line 2: 'bad' is not a valid hunk header. ${hunkHeaders}`
        );
        expect(failure('*** Begin Patch\n*** Add File: file.txt\nbad\n*** End Patch')).toBe(
            `Invalid patch hunk on line 3: 'bad' is not a valid hunk header. ${hunkHeaders}`
        );
        expect(failure('*** Begin Patch\n*** Delete File: file.txt\nbad\n*** End Patch')).toBe(
            `Invalid patch hunk on line 3: 'bad' is not a valid hunk header. ${hunkHeaders}`
        );
        expect(
            failure(
                '*** Begin Patch\n*** Update File: old.txt\n*** Move to: new.txt\n*** Delete File: other.txt\n*** End Patch'
            )
        ).toBe("Invalid patch hunk on line 2: Update file hunk for path 'old.txt' is empty");
        expect(failure('*** Begin Patch\n*** Update File: file.txt\n@@\n*** End Patch')).toBe(
            'Invalid patch hunk on line 4: Update hunk does not contain any lines'
        );
        expect(
            failure(
                '*** Begin Patch\n*** Update File: file.txt\n@@\n*** End of File\n*** End Patch'
            )
        ).toBe('Invalid patch hunk on line 4: Update hunk does not contain any lines');
        expect(failure('*** Begin Patch\n*** Update File: file.txt\n@@\n@@\n*** End Patch')).toBe(
            `Invalid patch hunk on line 4: Unexpected line found in update hunk: '@@'. ${lineStarts}`
        );
        expect(
            failure('*** Begin Patch\n*** Update File: file.txt\n@@\n-old\nbad\n*** End Patch')
        ).toBe(
            "Invalid patch hunk on line 5: Expected update hunk to start with a @@ context marker, got: 'bad'"
        );
        expect(
            failure(
                '*** Begin Patch\n*** Update File: file.txt\n@@\n*** Update File: other.txt\n*** End Patch'
            )
        ).toBe(
            `Invalid patch hunk on line 4: Unexpected line found in update hunk: '*** Update File: other.txt'. ${lineStarts}`
        );
    });
});
