import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editRunner } from '../editor.ts';
import { inlinePayloads } from '../operation.ts';
import {
    applyEditsToFileText,
    applyEditsToNormalizedContent,
    applyReplacementsToOriginal,
    normalizeToLF,
} from './edit-diff.ts';

let testDir = '';

beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'haus-edit-crlf-'));
});

afterEach(async () => {
    await rm(testDir, { force: true, recursive: true });
});

function replace(path: string, oldText: string, newText: string) {
    return editRunner(
        {
            edit: { command: 'str_replace', new_str: newText, old_str: oldText, path },
            kind: 'edit',
        },
        {
            agentId: 'agent_edit',
            cwd: testDir,
            env: { HOME: testDir },
            invocationId: 'invocation_edit',
            logPath: join(testDir, 'invocation.log'),
            payloads: inlinePayloads,
            signal: new AbortController().signal,
            timeoutMs: 30_000,
        }
    );
}

async function fileWith(name: string, content: string) {
    const path = join(testDir, name);
    await writeFile(path, content);
    return path;
}

function completed(path: string) {
    return {
        outcome: 'completed' as const,
        output: { kind: 'text' as const, text: `Successfully replaced 1 block(s) in ${path}.` },
        truncated: false,
    };
}

function failed(text: string) {
    return {
        outcome: 'failed' as const,
        output: { kind: 'text' as const, text },
        truncated: false,
    };
}

describe('edit tool CRLF handling', () => {
    const cases = [
        {
            name: 'should match LF oldText against CRLF file content',
            original: 'line one\r\nline two\r\nline three\r\n',
            oldText: 'line two\n',
            newText: 'replaced line\n',
            written: 'line one\r\nreplaced line\r\nline three\r\n',
        },
        {
            name: 'should preserve CRLF line endings after edit',
            original: 'first\r\nsecond\r\nthird\r\n',
            oldText: 'second\n',
            newText: 'REPLACED\n',
            written: 'first\r\nREPLACED\r\nthird\r\n',
        },
        {
            name: 'should preserve LF line endings for LF files',
            original: 'first\nsecond\nthird\n',
            oldText: 'second\n',
            newText: 'REPLACED\n',
            written: 'first\nREPLACED\nthird\n',
        },
        {
            name: 'should preserve UTF-8 BOM after edit',
            original: '\uFEFFfirst\r\nsecond\r\nthird\r\n',
            oldText: 'second\n',
            newText: 'REPLACED\n',
            written: '\uFEFFfirst\r\nREPLACED\r\nthird\r\n',
        },
        {
            name: 'should write CRLF for inserted lines in CRLF files',
            original: 'first\r\nsecond\r\nthird',
            oldText: 'second\nthird',
            newText: '2a\r\n2b\nthird!',
            written: 'first\r\n2a\r\n2b\r\nthird!',
        },
        {
            name: 'should write LF for inserted lines in LF files',
            original: 'first\nsecond\nthird',
            oldText: 'second\nthird',
            newText: '2a\r\n2b\nthird!',
            written: 'first\n2a\n2b\nthird!',
        },
        {
            name: 'should keep CRLF lines when the first line ends with LF',
            original: 'a\nb\r\nX = 1\r\n',
            oldText: 'X = 1',
            newText: 'X = 2',
            written: 'a\nb\r\nX = 2\r\n',
        },
        {
            name: 'should keep LF lines when the first line ends with CRLF',
            original: 'a\r\nb\nc',
            oldText: 'c',
            newText: 'C',
            written: 'a\r\nb\nC',
        },
        {
            name: 'should keep a lone CR in an untouched line',
            original: 'a\rb\nX = 1\n',
            oldText: 'X = 1',
            newText: 'X = 2',
            written: 'a\rb\nX = 2\n',
        },
        {
            name: 'should keep untouched line endings when fuzzy matching widens the edit to whole lines',
            original: 'a\r\nfoo   \r\nb\n',
            oldText: 'foo\n',
            newText: 'FOO\n',
            written: 'a\r\nFOO\r\nb\n',
        },
        {
            name: 'should not merge a kept lone CR with an inserted line feed after it',
            original: 'a\rb\nc',
            oldText: 'b',
            newText: '\nB',
            written: 'a\r\n\nB\nc',
        },
        {
            name: 'should not merge a kept lone CR with a kept line feed across a deletion',
            original: 'a\rb\nc',
            oldText: 'b',
            newText: '',
            written: 'a\r\n\nc',
        },
    ];

    for (const { name, original, oldText, newText, written } of cases) {
        test(name, async () => {
            const path = await fileWith('crlf.txt', original);
            expect(await replace(path, oldText, newText)).toEqual(completed(path));
            expect(await readFile(path, 'utf-8')).toBe(written);
        });
    }

    test('should detect duplicates across CRLF/LF variants', async () => {
        const path = await fileWith('mixed-endings.txt', 'hello\r\nworld\r\n---\r\nhello\nworld\n');
        expect(await replace(path, 'hello\nworld\n', 'replaced\n')).toEqual(
            failed(
                `Found 2 occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`
            )
        );
    });

    test('should preserve CRLF line endings and BOM in multi-edit mode', () => {
        const edits = [
            { newText: 'SECOND\n', oldText: 'second\n' },
            { newText: 'FOURTH\n', oldText: 'fourth\n' },
        ];
        expect(
            applyEditsToFileText('\uFEFFfirst\r\nsecond\r\nthird\r\nfourth\r\n', edits, 'f.txt')
        ).toBe('\uFEFFfirst\r\nSECOND\r\nthird\r\nFOURTH\r\n');
    });

    test('should give inserted lines the line ending of the line they replace in multi-edit mode', () => {
        const edits = [
            { newText: 'A\nB\n', oldText: 'lf1\n' },
            { newText: 'C\nD\n', oldText: 'cr1\n' },
        ];
        expect(applyEditsToFileText('lf1\nlf2\ncr1\r\ncr2\r\n', edits, 'f.txt')).toBe(
            'A\nB\nlf2\nC\r\nD\r\ncr2\r\n'
        );
    });

    test('should not merge an inserted CR line ending with a kept line feed after it', () => {
        const written = applyReplacementsToOriginal('a\rb\nc', [
            { matchIndex: 2, matchLength: 1, newText: '\r' },
        ]);
        expect(normalizeToLF(written)).toBe('a\n\n\nc');
    });

    test('should write content that normalizes to the diffed content for random mixed line endings', () => {
        let seed = 1;
        const random = (n: number) => {
            seed = (seed * 1_103_515_245 + 12_345) & 0x7f_ff_ff_ff;
            return Math.floor((seed / 0x80_00_00_00) * n);
        };
        const endings = ['\n', '\r\n', '\r', ''];
        let checked = 0;
        for (let run = 0; run < 3000; run++) {
            let original = '';
            for (let line = random(12) + 1; line > 0; line--) {
                original += `w${random(100)}${random(5) === 0 ? '  ' : ''}${endings[random(4)]}`;
            }
            const normalized = normalizeToLF(original);
            const start = random(normalized.length);
            const oldText = normalized.slice(start, start + 1 + random(12));
            const newText = ['', '\n', 'X\n', '\nY', '\r', 'Z'][random(6)] ?? '';
            const applied = tryApply(normalized, oldText, newText);
            if (applied) {
                expect(
                    normalizeToLF(applyReplacementsToOriginal(original, applied.replacements))
                ).toBe(applied.newContent);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(1000);
    });
});

function tryApply(normalized: string, oldText: string, newText: string) {
    try {
        return applyEditsToNormalizedContent(normalized, [{ newText, oldText }], 'f.txt');
    } catch {
        return null;
    }
}
