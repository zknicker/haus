import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editRunner } from '../editor.ts';
import { operationSession } from '../operation-session.test-support.ts';
import { inlinePayloads } from '../operation.ts';
import { applyEditsToFileText, splitBom } from './edit-diff.ts';

let testDir = '';

beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'haus-edit-diff-'));
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
            ...operationSession(),
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

describe('edit tool', () => {
    test('should replace text in file', async () => {
        const path = await fileWith('edit-test.txt', 'Hello, world!');
        expect(await replace(path, 'world', 'testing')).toEqual(completed(path));
        expect(await readFile(path, 'utf-8')).toBe('Hello, testing!');
    });

    test('should fail if text not found', async () => {
        const path = await fileWith('edit-test.txt', 'Hello, world!');
        expect(await replace(path, 'nonexistent', 'testing')).toEqual(
            failed(
                `Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.`
            )
        );
    });

    test('should include ENOENT when the edit target does not exist', async () => {
        const path = join(testDir, 'missing.txt');
        expect(await replace(path, 'hello', 'world')).toEqual(
            failed(`Could not edit file: ${path}. Error code: ENOENT.`)
        );
    });

    test('should fail if text appears multiple times', async () => {
        const path = await fileWith('edit-test.txt', 'foo foo foo');
        expect(await replace(path, 'foo', 'bar')).toEqual(
            failed(
                `Found 3 occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`
            )
        );
    });

    test('should fail when the replacement produces identical content', async () => {
        const path = await fileWith('edit-test.txt', 'Hello, world!');
        expect(await replace(path, 'world', 'world')).toEqual(
            failed(
                `No changes made to ${path}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`
            )
        );
    });

    test('should include EACCES for read-only files', async () => {
        const path = await fileWith('edit-readonly.txt', 'hello\n');
        await chmod(path, 0o444);
        expect(await replace(path, 'hello', 'world')).toEqual(
            failed(`Could not edit file: ${path}. Error code: EACCES.`)
        );
    });
});

describe('edit tool fuzzy matching', () => {
    const cases = [
        {
            name: 'should match text with trailing whitespace stripped',
            original: 'line one   \nline two  \nline three\n',
            oldText: 'line one\nline two\n',
            newText: 'replaced\n',
            written: 'replaced\nline three\n',
        },
        {
            name: 'should match fullwidth punctuation in Chinese text',
            original: '你好，世界\n你好（世界）\n',
            oldText: '你好,世界\n你好(世界)\n',
            newText: '你好，pi\n你好(pi)\n',
            written: '你好，pi\n你好(pi)\n',
        },
        {
            name: 'should match compatibility-equivalent Unicode forms',
            original: 'ＡＢＣ１２３\ncafe\u0301\n',
            oldText: 'ABC123\ncafé\n',
            newText: 'XYZ789\ncoffee\n',
            written: 'XYZ789\ncoffee\n',
        },
        {
            name: 'should match smart single quotes to ASCII quotes',
            original: 'console.log(\u2018hello\u2019);\n',
            oldText: "console.log('hello');",
            newText: "console.log('world');",
            written: "console.log('world');\n",
        },
        {
            name: 'should match smart double quotes to ASCII quotes',
            original: 'const msg = \u201CHello World\u201D;\n',
            oldText: 'const msg = "Hello World";',
            newText: 'const msg = "Goodbye";',
            written: 'const msg = "Goodbye";\n',
        },
        {
            name: 'should match Unicode dashes to ASCII hyphen',
            original: 'range: 1\u20135\nbreak\u2014here\n',
            oldText: 'range: 1-5\nbreak-here',
            newText: 'range: 10-50\nbreak--here',
            written: 'range: 10-50\nbreak--here\n',
        },
        {
            name: 'should match non-breaking space to regular space',
            original: 'hello\u00A0world\n',
            oldText: 'hello world',
            newText: 'hello universe',
            written: 'hello universe\n',
        },
        {
            name: 'should prefer exact match over fuzzy match',
            original: "const x = 'exact';\nconst y = 'other';\n",
            oldText: "const x = 'exact';",
            newText: "const x = 'changed';",
            written: "const x = 'changed';\nconst y = 'other';\n",
        },
        {
            name: 'should preserve the correct occurrence when fuzzy replacement equals a nearby line',
            original: 'replace me   \nafter   \n',
            oldText: 'replace me\n',
            newText: 'after\n',
            written: 'after\nafter   \n',
        },
    ];

    for (const { name, original, oldText, newText, written } of cases) {
        test(name, async () => {
            const path = await fileWith('fuzzy.txt', original);
            expect(await replace(path, oldText, newText)).toEqual(completed(path));
            expect(await readFile(path, 'utf-8')).toBe(written);
        });
    }

    test('should still fail when text is not found even with fuzzy matching', async () => {
        const path = await fileWith('no-match.txt', 'completely different content\n');
        expect((await replace(path, 'this does not exist', 'replacement')).outcome).toBe('failed');
    });

    test('should detect duplicates after fuzzy normalization', async () => {
        const path = await fileWith('fuzzy-dups.txt', 'hello world   \nhello world\n');
        expect(await replace(path, 'hello world', 'replaced')).toEqual(
            failed(
                `Found 2 occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`
            )
        );
    });

    test('should support fuzzy matching in multi-edit mode', () => {
        const edits = [
            { newText: "console.log('world');\n", oldText: "console.log('hello');\n" },
            { newText: 'hello universe\n', oldText: 'hello world\n' },
        ];
        expect(
            applyEditsToFileText(
                'console.log(\u2018hello\u2019);\nhello\u00A0world\n',
                edits,
                'f.txt'
            )
        ).toBe("console.log('world');\nhello universe\n");
    });

    test('should preserve untouched lines for fuzzy multi-edits', () => {
        const original = [
            'keep before  ',
            'first target  ',
            'first after',
            'keep middle   ',
            'second target  ',
            'second after',
            'keep after  ',
            '',
        ].join('\n');
        const edits = [
            { newText: 'FIRST\nFIRST2', oldText: 'first target\nfirst after' },
            { newText: 'SECOND\nSECOND2', oldText: 'second target\nsecond after' },
        ];
        expect(applyEditsToFileText(original, edits, 'f.txt')).toBe(
            [
                'keep before  ',
                'FIRST',
                'FIRST2',
                'keep middle   ',
                'SECOND',
                'SECOND2',
                'keep after  ',
                '',
            ].join('\n')
        );
    });
});

describe('issue #8337 UTF-8 BOM parsing', () => {
    test('splits a leading BOM from decoded text', () => {
        expect(splitBom('\uFEFFcontent')).toEqual({ bom: '\uFEFF', text: 'content' });
        expect(splitBom('content')).toEqual({ bom: '', text: 'content' });
    });

    test('matches old text after a leading BOM and keeps the BOM', async () => {
        const path = await fileWith('bom.txt', '\uFEFFfirst line\n');
        expect(await replace(path, 'first', 'only')).toEqual(completed(path));
        expect(await readFile(path, 'utf-8')).toBe('\uFEFFonly line\n');
    });
});
