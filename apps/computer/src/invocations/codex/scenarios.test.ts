import { describe, expect, test } from 'bun:test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { applyPatchIn, patchWorkspace } from './apply-patch.test-support.ts';

type Tree = Record<string, string>;

interface Scenario {
    expected: Tree;
    input: Tree;
    name: string;
    patch: string;
}

const stable = { 'foo.txt': 'stable\n' };
const moveInput = {
    'old/name.txt': 'old content\n',
    'old/other.txt': 'unrelated file\n',
};
const overwriteMoveInput = {
    'old/name.txt': 'from\n',
    'old/other.txt': 'unrelated file\n',
    'renamed/dir/name.txt': 'existing\n',
};

const scenarios: Scenario[] = [
    {
        expected: { 'bar.md': 'This is a new file\n' },
        input: {},
        name: '001_add_file',
        patch: '*** Begin Patch\n*** Add File: bar.md\n+This is a new file\n*** End Patch\n',
    },
    {
        expected: { 'modify.txt': 'line1\nchanged\n', 'nested/new.txt': 'created\n' },
        input: { 'delete.txt': 'obsolete\n', 'modify.txt': 'line1\nline2\n' },
        name: '002_multiple_operations',
        patch: '*** Begin Patch\n*** Add File: nested/new.txt\n+created\n*** Delete File: delete.txt\n*** Update File: modify.txt\n@@\n-line2\n+changed\n*** End Patch\n',
    },
    {
        expected: { 'multi.txt': 'line1\nchanged2\nline3\nchanged4\n' },
        input: { 'multi.txt': 'line1\nline2\nline3\nline4\n' },
        name: '003_multiple_chunks',
        patch: '*** Begin Patch\n*** Update File: multi.txt\n@@\n-line2\n+changed2\n@@\n-line4\n+changed4\n*** End Patch\n',
    },
    {
        expected: { 'old/other.txt': 'unrelated file\n', 'renamed/dir/name.txt': 'new content\n' },
        input: moveInput,
        name: '004_move_to_new_directory',
        patch: '*** Begin Patch\n*** Update File: old/name.txt\n*** Move to: renamed/dir/name.txt\n@@\n-old content\n+new content\n*** End Patch\n',
    },
    {
        expected: stable,
        input: stable,
        name: '005_rejects_empty_patch',
        patch: '*** Begin Patch\n*** End Patch\n',
    },
    {
        expected: { 'modify.txt': 'line1\nline2\n' },
        input: { 'modify.txt': 'line1\nline2\n' },
        name: '006_rejects_missing_context',
        patch: '*** Begin Patch\n*** Update File: modify.txt\n@@\n-missing\n+changed\n*** End Patch\n',
    },
    {
        expected: stable,
        input: stable,
        name: '007_rejects_missing_file_delete',
        patch: '*** Begin Patch\n*** Delete File: missing.txt\n*** End Patch\n',
    },
    {
        expected: stable,
        input: stable,
        name: '008_rejects_empty_update_hunk',
        patch: '*** Begin Patch\n*** Update File: foo.txt\n*** End Patch\n',
    },
    {
        expected: stable,
        input: stable,
        name: '009_requires_existing_file_for_update',
        patch: '*** Begin Patch\n*** Update File: missing.txt\n@@\n-old\n+new\n*** End Patch\n',
    },
    {
        expected: overwriteMoveInput,
        input: overwriteMoveInput,
        name: '010_move_refuses_existing_destination',
        patch: '*** Begin Patch\n*** Update File: old/name.txt\n*** Move to: renamed/dir/name.txt\n@@\n-from\n+new\n*** End Patch\n',
    },
    {
        expected: { 'duplicate.txt': 'old content\n' },
        input: { 'duplicate.txt': 'old content\n' },
        name: '011_add_refuses_existing_file',
        patch: '*** Begin Patch\n*** Add File: duplicate.txt\n+new content\n*** End Patch\n',
    },
    {
        expected: { 'dir/foo.txt': 'stable\n' },
        input: { 'dir/foo.txt': 'stable\n' },
        name: '012_delete_directory_fails',
        patch: '*** Begin Patch\n*** Delete File: dir\n*** End Patch\n',
    },
    {
        expected: stable,
        input: stable,
        name: '013_rejects_invalid_hunk_header',
        patch: '*** Begin Patch\n*** Frobnicate File: foo\n*** End Patch\n',
    },
    {
        expected: { 'no_newline.txt': 'first line\nsecond line\n' },
        input: { 'no_newline.txt': 'no newline at end\n' },
        name: '014_update_file_appends_trailing_newline',
        patch: '*** Begin Patch\n*** Update File: no_newline.txt\n@@\n-no newline at end\n+first line\n+second line\n*** End Patch\n',
    },
    {
        expected: {},
        input: {},
        name: '015_failure_after_partial_success_writes_nothing',
        patch: '*** Begin Patch\n*** Add File: created.txt\n+hello\n*** Update File: missing.txt\n@@\n-old\n+new\n*** End Patch\n',
    },
    {
        expected: { 'input.txt': 'line1\nline2\nadded line 1\nadded line 2\n' },
        input: { 'input.txt': 'line1\nline2\n' },
        name: '016_pure_addition_update_chunk',
        patch: '*** Begin Patch\n*** Update File: input.txt\n@@\n+added line 1\n+added line 2\n*** End Patch\n',
    },
    {
        expected: { 'foo.txt': 'new\n' },
        input: { 'foo.txt': 'old\n' },
        name: '017_whitespace_padded_hunk_header',
        patch: '*** Begin Patch\n  *** Update File: foo.txt\n@@\n-old\n+new\n*** End Patch\n',
    },
    {
        expected: { 'file.txt': 'two\n' },
        input: { 'file.txt': 'one\n' },
        name: '018_whitespace_padded_patch_markers',
        patch: ' *** Begin Patch\n*** Update File: file.txt\n@@\n-one\n+two\n*** End Patch \n',
    },
    {
        expected: { 'foo.txt': 'line1\nnaïve café ✅\nline3\n' },
        input: { 'foo.txt': 'line1\nnaïve café\nline3\n' },
        name: '019_unicode_simple',
        patch: '*** Begin Patch\n*** Update File: foo.txt\n@@\n line1\n-naïve café\n+naïve café ✅\n*** End Patch\n',
    },
    {
        expected: { 'keep.txt': 'keep\n' },
        input: { 'keep.txt': 'keep\n', 'obsolete.txt': 'obsolete\n' },
        name: '020_delete_file_success',
        patch: '*** Begin Patch\n*** Delete File: obsolete.txt\n*** End Patch\n',
    },
    {
        expected: { 'file.txt': 'two\n' },
        input: { 'file.txt': 'one\n' },
        name: '020_whitespace_padded_patch_marker_lines',
        patch: '*** Begin Patch \n*** Update File: file.txt\n@@\n-one\n+two\n *** End Patch\n',
    },
    {
        expected: { 'lines.txt': 'line1\nline3\n' },
        input: { 'lines.txt': 'line1\nline2\nline3\n' },
        name: '021_update_file_deletion_only',
        patch: '*** Begin Patch\n*** Update File: lines.txt\n@@\n line1\n-line2\n line3\n*** End Patch\n',
    },
    {
        expected: { 'tail.txt': 'first\nsecond updated\n' },
        input: { 'tail.txt': 'first\nsecond\n' },
        name: '022_update_file_end_of_file_marker',
        patch: '*** Begin Patch\n*** Update File: tail.txt\n@@\n first\n-second\n+second updated\n*** End of File\n*** End Patch\n',
    },
    {
        expected: { 'lines.txt': 'ONE\r\ntwo\r\nbetween\r\nthree\r\n' },
        input: { 'lines.txt': 'one\r\ntwo\r\nthree\r\n' },
        name: '023_preserves_crlf_line_endings',
        patch: '*** Begin Patch\n*** Update File: lines.txt\n@@\n-one\n+ONE\n two\n+between\n three\n*** End Patch\n',
    },
    {
        expected: { 'lines.txt': 'one\r\ntwo\rTHREE\r\nfour\r\n' },
        input: { 'lines.txt': 'one\r\ntwo\rthree\nfour\r\n' },
        name: '024_preserves_mixed_line_endings',
        patch: '*** Begin Patch\n*** Update File: lines.txt\n@@\n one\n two\n-three\n+THREE\n four\n*** End Patch\n',
    },
];

const workspace = patchWorkspace();

describe('apply_patch scenarios', () => {
    for (const scenario of scenarios) {
        test(scenario.name, async () => {
            const root = join(workspace.dir, 'tree');
            await mkdir(root);
            for (const [path, contents] of Object.entries(scenario.input)) {
                await mkdir(dirname(join(root, path)), { recursive: true });
                await writeFile(join(root, path), contents);
            }
            await applyPatchIn(root, scenario.patch);
            expect(await snapshot(root)).toEqual(withDirectories(scenario.expected));
        });
    }
});

async function snapshot(root: string) {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const tree: Tree = {};
    for (const entry of entries) {
        const path = join(entry.parentPath, entry.name).slice(root.length + 1);
        tree[path] = entry.isDirectory() ? '<dir>' : await readFile(join(root, path), 'utf8');
    }
    return tree;
}

function withDirectories(files: Tree) {
    const tree: Tree = { ...files };
    for (const path of Object.keys(files)) {
        for (let parent = dirname(path); parent !== '.'; parent = dirname(parent)) {
            tree[parent] = '<dir>';
        }
    }
    return tree;
}
