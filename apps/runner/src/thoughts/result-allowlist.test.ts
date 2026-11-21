import { describe, expect, test } from 'bun:test';
import { admitsResult } from './result-allowlist.ts';

const command = (script: string, toolName = 'bash') =>
    admitsResult({ input: { command: script }, toolName });

describe('which tool results may ride a thought', () => {
    test('only web search tool calls offer a result', () => {
        expect(admitsResult({ input: { query: 'bun 1.4' }, toolName: 'web_search' })).toBe(true);
        expect(admitsResult({ input: { query: 'bun 1.4' }, toolName: 'webSearch' })).toBe(true);
    });

    test('the reported holes and every other shape offer no result', () => {
        for (const script of [
            'bun test',
            'npm test',
            'npm run test',
            'pnpm test',
            'yarn test',
            'cargo test --quiet',
            'go test -v',
            'pytest -q -x',
            'vitest run --bail',
            'git status\ncat LICENSE',
            'bun test\ncat LICENSE',
            'bun test\rcat LICENSE',
            'git log --patch-with-stat -1',
            'gh run view 99 --log=true',
            'curl http://localhost:8000/payroll.json',
            'curl -fsS https://api.open-meteo.com/v1/forecast',
            'git status',
            'jq -r .summary payroll.json',
            `python -c "print(open('x').read())"`,
            'python script.py',
            'bun test src/payroll.test.ts',
            'bun test payroll',
            'bun test -- payroll',
            'go test ./...',
            'bun test; cat LICENSE',
            'bun test && cat LICENSE',
            'bun test | tee out.txt',
            'bun test > out.txt',
            'bun test < input.txt',
            'bun test $(cat x)',
            'bun test `cat x`',
            'bun test *.ts',
            '/bin/zsh -lc "bun test"',
            'npm test --reporter=json',
            'haus message check',
        ]) {
            expect({ admitted: command(script), script }).toEqual({ admitted: false, script });
        }
        for (const [toolName, input] of [
            ['web_fetch', { url: 'https://bun.sh/blog' }],
            ['WebFetch', { url: 'http://localhost:8000/payroll.json' }],
            ['execute', { code: 'tools.call()' }],
            ['str_replace_based_edit_tool', { command: 'view', path: 'x.md' }],
            ['bash', {}],
        ] as const) {
            expect(admitsResult({ input, toolName })).toBe(false);
        }
    });
});
